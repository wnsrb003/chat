"""
Bull 큐 호환 Worker
Bull이 Redis에 저장하는 형식을 읽어서 처리
"""
import asyncio
import json
import time
import sys
from redis import Redis
from loguru import logger

from src.config import settings
from src.models import TranslationJob, TranslationResult, PreprocessOptions
from src.preprocessor.text_processor import TextPreprocessor

# 번역 서비스는 더 이상 사용하지 않음 (API Gateway에서 처리)

# 로깅 설정
logger.remove()
logger.add(
    sys.stdout,
    format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan> - <level>{message}</level>",
    level=settings.log_level
)

# 전처리기 초기화 (번역은 API Gateway에서 처리)
preprocessor = TextPreprocessor()

# RPS 모니터링 카운터
job_processing_counter = 0
preprocessing_complete_counter = 0


def process_bull_job(job_id: str, job_data: dict) -> dict:
    """Bull 작업 처리 - 전처리 전용 (번역은 API Gateway에서 처리)"""
    global job_processing_counter
    job_processing_counter += 1  # RPS 카운터

    start_time = time.time()

    try:
        # Job 데이터 파싱
        try:
            job = TranslationJob(**job_data)
        except Exception as e:
            logger.error(f"Failed to parse job data: {e}", exc_info=True)
            return None

        logger.debug(f"Processing job {job_id}: '{job.text[:50]}...')")

        # 옵션 설정
        options = job.options or PreprocessOptions()

        # 1. 전처리
        preprocess_start = time.time()
        try:
            preprocessed_text, filtered, filter_reason = preprocessor.preprocess(
                text=job.text,
                expand_abbreviations=options.expand_abbreviations,
                filter_profanity=options.filter_profanity,
                normalize_repeats=options.normalize_repeats,
                remove_emoticons=options.remove_emoticons,
                fix_typos=options.fix_typos,
                add_spacing=options.add_spacing,
            )
        except Exception as e:
            logger.error(f"Preprocessing failed: {e}", exc_info=True)
            return None

        preprocess_time = (time.time() - preprocess_start) * 1000  # ms

        # 2. 언어 감지
        lang_detect_start = time.time()
        detected_lang = preprocessor.detect_language(preprocessed_text)
        if not detected_lang:
            detected_lang = "ko"  # 기본값
        lang_detect_time = (time.time() - lang_detect_start) * 1000  # ms

        processing_time = (time.time() - start_time) * 1000  # ms

        # 3. 전처리 결과 반환 (번역은 API Gateway에서 수행)
        result = {
            "original_text": job.text,
            "preprocessed_text": preprocessed_text,
            "detected_language": detected_lang,
            "preprocessing_time_ms": processing_time,
            "filtered": filtered,
            "filter_reason": filter_reason if filtered else None,
        }

        logger.debug(f"Job {job_id} preprocessing completed in {processing_time:.0f}ms")

        return result

    except Exception as e:
        logger.error(f"Job processing error: {e}", exc_info=True)
        raise


def get_waiting_jobs(redis_conn: Redis, queue_name: str):
    """Bull 큐에서 대기 중인 작업 가져오기 (최적화됨)"""
    # Bull은 bull:{queue_name}:wait 리스트에 작업 ID 저장
    wait_key = f"bull:{queue_name}:wait"
    active_key = f"bull:{queue_name}:active"

    logger.debug(f"Polling queue: {wait_key}")

    while True:
        # BRPOPLPUSH로 작업 가져오기 (블로킹, 타임아웃 0.1초로 단축)
        job_id = redis_conn.brpoplpush(wait_key, active_key, timeout=0.1)

        if job_id:
            decoded_id = job_id.decode('utf-8')
            logger.debug(f"Received job ID: {decoded_id}")
            yield decoded_id
        # 타임아웃 시 로깅 제거 (성능 향상)


def get_job_data(redis_conn: Redis, queue_name: str, job_id: str):
    """작업 데이터 가져오기 (최적화됨)"""
    job_key = f"bull:{queue_name}:{job_id}"

    # Bull은 작업 데이터를 JSON으로 저장
    job_data_raw = redis_conn.hget(job_key, 'data')

    if not job_data_raw:
        logger.error(f"Job {job_id} data not found in key: {job_key}")
        return None

    try:
        # JSON 파싱
        if isinstance(job_data_raw, bytes):
            job_data_raw = job_data_raw.decode('utf-8')

        job_data = json.loads(job_data_raw)
        return job_data
    except Exception as e:
        logger.error(f"Failed to parse job data: {e}", exc_info=True)
        return None

def complete_job(redis_conn: Redis, queue_name: str, job_id: str, result: dict):
    """전처리 완료 이벤트 발행 (API Gateway가 전처리 결과를 받아서 gRPC 호출)"""
    global preprocessing_complete_counter
    preprocessing_complete_counter += 1  # RPS 카운터

    logger.debug(f"Publishing preprocessing result for job {job_id}")

    # ✨ active 리스트에서 제거 (중요! 안하면 계속 쌓임)
    redis_conn.lrem(f"bull:{queue_name}:active", 0, job_id)

    # 전처리 결과를 API Gateway로 전달
    redis_conn.publish(
        "bull:preprocessing-results:jobId",
        json.dumps({
            'jobId': job_id,
            'result': result,
            'status': 'completed'
        }, ensure_ascii=False)
    )
    logger.debug(f"Preprocessing result published for job {job_id}")
# def complete_job(redis_conn: Redis, queue_name: str, job_id: str, result: dict):
#     """작업 완료 처리"""
#     job_key = f"bull:{queue_name}:{job_id}"

#     # 결과 저장
#     redis_conn.hset(job_key, 'returnvalue', json.dumps(result, ensure_ascii=False))

#     # 상태 업데이트
#     redis_conn.hset(job_key, 'finishedOn', int(time.time() * 1000))

#     # active에서 제거하고 completed로 이동
#     redis_conn.lrem(f"bull:{queue_name}:active", 0, job_id)
#     redis_conn.zadd(f"bull:{queue_name}:completed", {job_id: time.time() * 1000})

#     # 완료 이벤트 발행
#     redis_conn.publish(f"bull:translation-results:completed", json.dumps({'jobId': job_id}, ensure_ascii=False))
#     logger.info(f"Job {job_id} marked as completed")

#     # 잡 완료 감지 이벤트 발행
    # redis_conn.publish(f"bull:translation-results:completed:jobId", json.dumps({'jobId': job_id, 'result': result}, ensure_ascii=False))
#     logger.info(f"Job {job_id} published event completed : {result}")

def fail_job(redis_conn: Redis, queue_name: str, job_id: str, error: str):
    """전처리 실패 처리"""
    # ✨ active 리스트에서 제거 (중요! 안하면 계속 쌓임)
    redis_conn.lrem(f"bull:{queue_name}:active", 0, job_id)

    redis_conn.publish(
        "bull:preprocessing-results:jobId",
        json.dumps({
            'jobId': job_id,
            'result': {'filter_reason': error},
            'status': 'failed'
        }, ensure_ascii=False)
    )

    # job_key = f"bull:{queue_name}:{job_id}"

    # # 에러 정보 저장
    # redis_conn.hset(job_key, 'failedReason', error)
    # redis_conn.hset(job_key, 'finishedOn', int(time.time() * 1000))

    # # active에서 제거하고 failed로 이동
    # redis_conn.lrem(f"bull:{queue_name}:active", 0, job_id)
    # redis_conn.zadd(f"bull:{queue_name}:failed", {job_id: time.time() * 1000})

    # # 실패 이벤트 발행
    # redis_conn.publish(f"bull:{queue_name}:failed", json.dumps({'jobId': job_id, 'error': error}, ensure_ascii=False))

    logger.error(f"Job {job_id} marked as failed: {error}")


async def worker_task(worker_id: int, queue_name: str):
    """개별 워커 태스크 (전처리 전용)"""
    # 각 워커마다 독립적인 Redis 연결 생성
    redis_conn = Redis(
        host=settings.redis_host,
        port=settings.redis_port,
        password=settings.redis_password,
        decode_responses=False  # Bull은 바이너리 데이터 사용
    )

    logger.info(f"Worker-{worker_id} started (preprocessing only)")

    try:
        for job_id in get_waiting_jobs(redis_conn, queue_name):
            try:
                # 작업 데이터 가져오기
                job_data = get_job_data(redis_conn, queue_name, job_id)

                if not job_data:
                    fail_job(redis_conn, queue_name, job_id, "Failed to get job data")
                    continue

                job_start = time.time()

                # 전처리만 수행
                result = process_bull_job(job_id, job_data)

                if not result:
                    fail_job(redis_conn, queue_name, job_id, "Preprocessing failed")
                    continue

                # 완료 처리 (전처리 결과 발행)
                complete_job(redis_conn, queue_name, job_id, result)

                job_duration = (time.time() - job_start) * 1000
                logger.debug(f"Job {job_id} completed in {job_duration:.0f}ms")

            except Exception as e:
                logger.error(f"[Worker-{worker_id}] Error processing job {job_id}: {e}", exc_info=True)
                fail_job(redis_conn, queue_name, job_id, str(e))

    except KeyboardInterrupt:
        logger.info(f"Worker-{worker_id} shutting down...")
    except Exception as e:
        logger.error(f"Worker-{worker_id} error: {e}", exc_info=True)
    finally:
        # Redis 연결 종료
        redis_conn.close()
        logger.info(f"Worker-{worker_id} Redis connection closed")


async def monitor_rps():
    """RPS 모니터링 태스크"""
    global job_processing_counter, preprocessing_complete_counter

    while True:
        await asyncio.sleep(1)
        logger.info(f"[METRIC] PYTHON_WORKER | job_processing_rps={job_processing_counter} | preprocessing_complete_rps={preprocessing_complete_counter}")
        job_processing_counter = 0
        preprocessing_complete_counter = 0


async def main():
    """메인 워커 루프 (전처리 전용)"""
    queue_name = settings.queue_name
    concurrency = settings.worker_concurrency

    logger.info("Starting preprocessing worker...")
    logger.info(f"Redis: {settings.redis_host}:{settings.redis_port}")
    logger.info(f"Queue: {queue_name}")
    logger.info(f"Concurrency: {concurrency} workers")
    logger.info("Mode: Preprocessing only (translation handled by API Gateway)")
    logger.info("Workers started, waiting for jobs...")

    try:
        # 여러 워커를 병렬로 실행
        workers = [
            worker_task(worker_id=i+1, queue_name=queue_name)
            for i in range(concurrency)
        ]

        # RPS 모니터링 태스크 추가
        tasks = workers + [monitor_rps()]

        await asyncio.gather(*tasks)

    except KeyboardInterrupt:
        logger.info("All workers shutting down...")
    except Exception as e:
        logger.error(f"Main worker error: {e}", exc_info=True)


if __name__ == "__main__":
    asyncio.run(main())
