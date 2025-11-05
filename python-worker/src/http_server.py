"""
간단한 HTTP 서버 - Node.js API Gateway에서 직접 호출
"""
import asyncio
from aiohttp import web
import sys

from src.config import settings
from src.models import TranslationJob, TranslationResult, PreprocessOptions
from src.preprocessor.text_processor import TextPreprocessor
from src.services.vllm_service import VLLMService
from loguru import logger
import time

# 로깅 설정
logger.remove()
logger.add(
    sys.stdout,
    format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan> - <level>{message}</level>",
    level=settings.log_level
)

# 전처리기 및 번역 서비스 초기화
preprocessor = TextPreprocessor()
vllm_service = VLLMService()


async def translate_handler(request):
    """번역 요청 처리"""
    try:
        data = await request.json()
        start_time = time.time()

        # 데이터 검증
        job = TranslationJob(
            id=data.get('id', 'http-job'),
            text=data['text'],
            target_languages=data['targetLanguages'],
            options=PreprocessOptions(**(data.get('options', {}))),
            created_at=int(time.time() * 1000)
        )

        logger.info(f"Processing translation: '{job.text}'")

        # 전처리
        preprocessed_text, filtered, filter_reason = preprocessor.preprocess(
            text=job.text,
            expand_abbreviations=job.options.expand_abbreviations,
            filter_profanity=job.options.filter_profanity,
            normalize_repeats=job.options.normalize_repeats,
            remove_emoticons=job.options.remove_emoticons,
            fix_typos=job.options.fix_tyos,
        )

        # 필터링된 경우
        if filtered:
            logger.info(f"Text filtered: {filter_reason}")
            result = TranslationResult(
                id=job.id,
                original_text=job.text,
                preprocessed_text=preprocessed_text,
                translations={},
                detected_language="unknown",
                processing_time=time.time() - start_time,
                filtered=True,
                filter_reason=filter_reason,
            )
            return web.json_response(result.model_dump())

        # 언어 감지
        detected_lang = preprocessor.detect_language(preprocessed_text) or "ko"
        logger.info(f"Detected language: {detected_lang}")

        # VLLM 번역
        translations = await vllm_service.translate(
            text=preprocessed_text,
            source_lang=detected_lang,
            target_languages=job.target_languages
        )

        processing_time = time.time() - start_time

        # 결과 생성
        result = TranslationResult(
            id=job.id,
            original_text=job.text,
            preprocessed_text=preprocessed_text,
            translations=translations,
            detected_language=detected_lang,
            processing_time=processing_time,
            filtered=False,
        )

        logger.info(f"Translation completed in {processing_time:.2f}s")

        return web.json_response(result.model_dump())

    except Exception as e:
        logger.error(f"Translation Error: {e}", exc_info=True)
        return web.json_response(
            {'error': str(e)},
            status=500
        )


async def health_handler(request):
    """헬스 체크"""
    return web.json_response({
        'status': 'healthy',
        'vllm_url': settings.vllm_url
    })


async def init_app():
    """애플리케이션 초기화"""
    app = web.Application()

    # CORS 설정
    async def cors_middleware(app, handler):
        async def middleware(request):
            if request.method == 'OPTIONS':
                return web.Response(
                    headers={
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
                        'Access-Control-Allow-Headers': 'Content-Type',
                    }
                )
            response = await handler(request)
            response.headers['Access-Control-Allow-Origin'] = '*'
            return response
        return middleware

    app.middlewares.append(cors_middleware)

    # 라우트 설정
    app.router.add_post('/translate', translate_handler)
    app.router.add_get('/health', health_handler)

    return app


def main():
    """메인 함수"""
    logger.info("Starting HTTP translation worker...")
    logger.info(f"VLLM: {settings.vllm_url}")
    logger.info("Server will run on http://localhost:8001")

    app = asyncio.run(init_app())
    web.run_app(app, host='0.0.0.0', port=8001)


if __name__ == "__main__":
    main()
