import asyncio
import time
from redis import Redis
from rq import Worker, Queue, Connection
from loguru import logger
import sys

from src.config import settings
from src.models import TranslationJob, TranslationResult, PreprocessOptions
from src.preprocessor.text_processor import TextPreprocessor
from src.services.vllm_service import VLLMService

# 로깅 설정
logger.remove()
logger.add(
    sys.stdout,
    format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan> - <level>{message}</level>",
    level=settings.log_level
)

# Redis 연결
redis_conn = Redis(
    host=settings.redis_host,
    port=settings.redis_port,
    password=settings.redis_password,
    decode_responses=True
)

# 전처리기 및 번역 서비스 초기화
preprocessor = TextPreprocessor()
vllm_service = VLLMService()


def process_translation_job(job_data: dict) -> dict:
    """
    번역 작업 처리 함수 (동기)
    RQ는 동기 함수만 지원하므로 asyncio.run으로 비동기 함수 실행
    """
    return asyncio.run(async_process_translation_job(job_data))


async def async_process_translation_job(job_data: dict) -> dict:
    """비동기 번역 작업 처리"""
    start_time = time.time()

    try:
        # Job 데이터 파싱
        job = TranslationJob(**job_data)
        logger.info(f"Processing job {job.id}: '{job.text}'")

        # 옵션 설정
        options = job.options or PreprocessOptions()

        # 1. 전처리 (KSS 문장 분리 + ||| 구분자 포함)
        preprocessed_text, filtered, filter_reason = preprocessor.preprocess(
            text=job.text,
            expand_abbreviations=options.expand_abbreviations,
            filter_profanity=options.filter_profanity,
            normalize_repeats=options.normalize_repeats,
            remove_emoticons=options.remove_emoticons,
            fix_typos=options.fix_typos,
        )

        # 필터링된 경우
        if filtered:
            logger.info(f"Job {job.id} filtered: {filter_reason}")
            processing_time = time.time() - start_time

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

        # 2. 언어 감지 (구분자 제거 후 감지)
        text_for_detection = preprocessed_text.replace("|||", " ")
        detected_lang = preprocessor.detect_language(text_for_detection)
        if not detected_lang:
            detected_lang = "ko"  # 기본값
        logger.info(f"Detected language: {detected_lang}")

        # 3. VLLM 번역 요청 (구분자 포함된 텍스트 그대로 전달)
        translations = await vllm_service.translate(
            text=preprocessed_text,
            source_lang=detected_lang,
            target_languages=job.target_languages
        )

        processing_time = time.time() - start_time

        # 4. 결과 생성
        result = TranslationResult(
            id=job.id,
            original_text=job.text,
            preprocessed_text=preprocessed_text,
            translations=translations,
            detected_language=detected_lang,
            processing_time=processing_time,
            filtered=False,
        )

        logger.info(
            f"Job {job.id} completed in {processing_time:.2f}s"
        )

        return result.model_dump()

    except Exception as e:
        logger.error(f"Job processing error: {e}", exc_info=True)
        raise


def main():
    """워커 메인 함수"""
    logger.info("Starting translation worker...")
    logger.info(f"Redis: {settings.redis_host}:{settings.redis_port}")
    logger.info(f"Queue: {settings.queue_name}")
    logger.info(f"VLLM: {settings.vllm_url}")

    with Connection(redis_conn):
        queue = Queue(settings.queue_name)
        worker = Worker(
            [queue],
            connection=redis_conn,
        )

        logger.info("Worker started, waiting for jobs...")
        worker.work()


if __name__ == "__main__":
    main()
