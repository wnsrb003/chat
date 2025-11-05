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
from src.services.vllm_service import VLLMService
from src.services.ollama_service import OllamaService
from src.services.cache_service import CacheService
from src.services.translation_logger import translation_logger

# gRPC Service (선택적)
try:
    from src.services.cache_service_grpc import CacheServiceGRPC
    GRPC_AVAILABLE = True
except ImportError:
    GRPC_AVAILABLE = False

# 로깅 설정
logger.remove()
logger.add(
    sys.stdout,
    format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan> - <level>{message}</level>",
    level=settings.log_level
)

# 전처리기 및 번역 서비스 초기화
preprocessor = TextPreprocessor()
ollama_service = OllamaService()

# Cache Service 선택: gRPC (빠름) 또는 HTTP
# if settings.use_ollama:
#     translation_service = ollama_service
#     service_name = "Ollama"
# else:
#     # gRPC vs HTTP 선택
#     if settings.use_grpc and GRPC_AVAILABLE:
#         try:
#             caching_service = CacheServiceGRPC()
#             service_name = "Cache (gRPC)"
#             logger.info("✅ Using gRPC for cache service")
#         except Exception as e:
#             logger.warning(f"gRPC failed ({e}), falling back to HTTP")
#             caching_service = CacheService()
#             service_name = "Cache (HTTP)"
#     else:
#         if settings.use_grpc and not GRPC_AVAILABLE:
#             logger.warning("gRPC not available, falling back to HTTP")
#         caching_service = CacheService()
#         service_name = "Cache (HTTP)"
#     translation_service = caching_service


def process_bull_job(job_id: str, job_data: dict, translation_service) -> dict:
    """Bull 작업 처리 (최적화됨)"""
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

        # 필터링된 경우
        if filtered:
            logger.debug(f"Job {job_id} filtered: {filter_reason}")
            processing_time = time.time() - start_time

            # 필터링된 애는 번역 안태우고 원본 그대로 노출 - 맞나?
            result = TranslationResult(
                id=job.id,
                original_text=job.text,
                preprocessed_text=preprocessed_text,
                translations={},
                detected_language="unknown",
                processing_time=processing_time,
                filtered=True,
                filter_reason=filter_reason,
            )
            return result.model_dump()

        # 2. 언어 감지
        lang_detect_start = time.time()
        detected_lang = preprocessor.detect_language(preprocessed_text)
        if not detected_lang:
            detected_lang = "ko"  # 기본값
        lang_detect_time = time.time() - lang_detect_start

        # 3. 번역 요청 (Ollama 또는 VLLM)
        translate_start = time.time()
        loop = asyncio.get_running_loop()

        def sync_translate():
            return  
            
        # executor 스레드에서 동작
        translation, translate_processing_time_ms, translate_llm_time_ms, translate_cache_hit_time_ms = \
            translation_service.translate(
                text=preprocessed_text,
                source_lang=detected_lang,
                target_languages=job.target_languages
            )

        print(translation, "상위 성공")
        translate_time = time.time() - translate_start
        processing_time = time.time() - start_time

        # 4. 결과 생성
        result = TranslationResult(
            id=job.id,
            original_text=job.text,
            preprocessed_text=preprocessed_text,
            translations=translation,
            detected_language=detected_lang,
            processing_time=processing_time,
            filtered=False
        )

        # 5. CSV 로깅 (비동기, 설정에 따라)
        if settings.enable_translation_logging:
            translation_logger.log_bulk_translations(
                original_text=job.text,
                preprocessed_text=preprocessed_text,
                source_language=detected_lang,
                translations=translation,
                processing_time_ms=processing_time * 1000,
                lang_detect_time=lang_detect_time * 1000,
                translate_processing_time_ms=translate_processing_time_ms,
                translate_llm_time_ms=translate_llm_time_ms,
                translate_cache_hit_time_ms=translate_cache_hit_time_ms,
                filtered=False,
            )

        logger.debug(f"Job {job_id} completed in {processing_time*1000:.0f}ms")

        return result.model_dump()

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
    """작업 완료 이벤트만 발행 (Bull이 Redis 상태를 직접 관리하도록 둔다)"""
    print('complete_job start')
    # Bull 워커가 상태를 업데이트할 수 있도록 결과만 전달
    redis_conn.publish(f"bull:translation-results:jobId", json.dumps({'jobId': job_id, 'result': result, 'status': 'completed'}, ensure_ascii=False))
    print('complete_job end pulish')
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
    """작업 실패 처리"""
    redis_conn.publish(f"bull:translation-results:jobId", json.dumps({'jobId': job_id, 'result': null, 'status': 'failed'}, ensure_ascii=False))

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
    """개별 워커 태스크 (병렬 처리용)"""
    # 각 워커마다 독립적인 Redis 연결 생성
    redis_conn = Redis(
        host=settings.redis_host,
        port=settings.redis_port,
        password=settings.redis_password,
        decode_responses=False  # Bull은 바이너리 데이터 사용
    )

    logger.info(f"Worker-{worker_id} started with dedicated Redis connection")

    if settings.use_ollama:
        translation_service = ollama_service
        service_name = "Ollama"
    else:
        # gRPC vs HTTP 선택
        if settings.use_grpc and GRPC_AVAILABLE:
            try:
                caching_service = CacheServiceGRPC()
                service_name = "Cache (gRPC)"
                logger.info("✅ Using gRPC for cache service")
            except Exception as e:
                logger.warning(f"gRPC failed ({e}), falling back to HTTP")
                caching_service = CacheService()
                service_name = "Cache (HTTP)"
        else:
            if settings.use_grpc and not GRPC_AVAILABLE:
                logger.warning("gRPC not available, falling back to HTTP")
            caching_service = CacheService()
            service_name = "Cache (HTTP)"
        translation_service = caching_service

    try:
        for job_id in get_waiting_jobs(redis_conn, queue_name):
            try:
                # 작업 데이터 가져오기
                job_data = get_job_data(redis_conn, queue_name, job_id)

                if not job_data:
                    fail_job(redis_conn, queue_name, job_id, "Failed to get job data")
                    continue

                job_start =  time.time()
                # 작업 처리
                result = process_bull_job(job_id, job_data, translation_service)
                print(time.time() - job_start, '@@ job 끝')
                # 완료 처리
                complete_job(redis_conn, queue_name, job_id, result)
                
                print(time.time() - job_start, '완료 처리 done :', job_id, result)
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


async def main():
    """메인 워커 루프 (병렬 처리)"""
    queue_name = settings.queue_name
    concurrency = settings.worker_concurrency

    logger.info("Starting Bull-compatible worker...")
    logger.info(f"Redis: {settings.redis_host}:{settings.redis_port}")
    logger.info(f"Queue: {queue_name}")
    logger.info(f"Concurrency: {concurrency} workers")
    # logger.info(f"Translation Service: {service_name}")
    if settings.use_ollama:
        logger.info(f"Ollama: {settings.ollama_url} (Model: {settings.ollama_model})")
    else:
        logger.info(f"Cache Service: {settings.caching_url}")

    # 로깅 설정 출력
    if settings.enable_translation_logging:
        logger.info("Translation CSV logging: ENABLED (async queue-based)")
        translation_logger.start_background_writer()
    else:
        logger.info("Translation CSV logging: DISABLED")

    logger.info("Workers started, waiting for jobs...")



    try:
        # 여러 워커를 병렬로 실행
        workers = [
            worker_task(worker_id=i+1, queue_name=queue_name)
            for i in range(concurrency)
        ]

        await asyncio.gather(*workers)

    except KeyboardInterrupt:
        logger.info("All workers shutting down...")
    except Exception as e:
        logger.error(f"Main worker error: {e}", exc_info=True)
    finally:
        # 백그라운드 로거 종료
        if settings.enable_translation_logging:
            await translation_logger.stop_background_writer()


if __name__ == "__main__":
    asyncio.run(main())
