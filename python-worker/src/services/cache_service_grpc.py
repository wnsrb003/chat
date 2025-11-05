"""gRPC Cache Translation Service - HTTP보다 빠른 gRPC 연결"""
import sys
import os
import grpc
from typing import List
from loguru import logger
from src.config import settings
import asyncio

# proto 폴더를 path에 추가 (gRPC 공식 방식)
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
PROTO_DIR = os.path.join(ROOT_DIR, "proto")
sys.path.append(PROTO_DIR)

# proto 파일에서 생성된 gRPC 코드 직접 import
try:
    import translation_pb2
    import translation_pb2_grpc
    GRPC_AVAILABLE = True
except ImportError as e:
    logger.warning(f"gRPC proto not available: {e}")
    GRPC_AVAILABLE = False


class CacheServiceGRPC:
    """gRPC Cache 번역 서비스 - HTTP보다 빠른 연결"""

    def __init__(self):
        self.channel = None
        self.stub = None

        if not GRPC_AVAILABLE:
            raise ImportError("gRPC proto files not available. Compile .proto first")

        self.server_address = settings.caching_grpc_url
        self.connect()

    def connect(self):
        # """gRPC 채널 생성"""
        self.channel = grpc.insecure_channel(settings.caching_grpc_url)
        self.stub = translation_pb2_grpc.TranslationServiceStub(self.channel)
    
        logger.info(f"gRPC connected to {self.server_address}")

    def translate(
        self,
        text: str,
        source_lang: str,
        target_languages: List[str]
    ) -> tuple[dict, float, float, float]:
        """gRPC로 번역 요청 (동기 호출)"""        
        translations = {}
        translate_processing_time_ms = -1.0
        translate_llm_time_ms = -1.0
        translate_cache_hit_time_ms = -1.0

        # 에러 누적
        errors = []

        # loop = asyncio.get_running_loop()
        
        for target_lang in target_languages:
            try:
                translation, proc_time, llm_time, cache_time = self._translate_single(
                    text, source_lang, target_lang
                )
                translations[target_lang] = translation
                translate_processing_time_ms = proc_time
                translate_llm_time_ms = llm_time
                translate_cache_hit_time_ms = cache_time
            except grpc.RpcError as e:
                error_msg = f"gRPC error [{e.code().name}]: {e.details()}"
                logger.error(f"gRPC translation failed for {target_lang}: {error_msg}")
                errors.append(f"{target_lang}: {error_msg}")
                translations[target_lang] = f"[gRPC Error: {e.code().name}]"
            except Exception as e:
                error_msg = f"{type(e).__name__}: {str(e)}"
                logger.error(f"Translation failed for {target_lang}: {error_msg}", exc_info=True)
                errors.append(f"{target_lang}: {error_msg}")
                translations[target_lang] = f"[Error: {type(e).__name__}]"

        # 모든 언어가 실패했으면 예외 발생 (Bull에서 failed로 처리)
        if len(errors) == len(target_languages):
            error_summary = "; ".join(errors)
            logger.error(f"All translations failed: {error_summary}")
            raise Exception(f"All translations failed: {error_summary}")

        return translations, translate_processing_time_ms, translate_llm_time_ms, translate_cache_hit_time_ms

    def _translate_single(
        self,
        text: str,
        source_lang: str,
        target_lang: str
    ) -> tuple[str, float, float, float]:
        """단일 언어 gRPC 번역 (동기)"""
        try:
            # gRPC 요청 생성
            request = translation_pb2.TranslateRequest(
                text=text,
                source_lang=source_lang,
                target_langs=[target_lang],
                use_cache=True,
                cache_strategy='hybrid',
                translator_name='vllm'
            )

            # 동기 gRPC 호출 (timeout 30초)

            response = self.stub.Translate(request, timeout=settings.caching_timeout)
            print( '성공')
            if not response.success:
                error_msg = response.error_message or "Unknown server error"
                logger.error(f"gRPC server error for {target_lang}: {error_msg}")
                raise Exception(f"Server error: {error_msg}")

            # 응답 추출
            translation = response.translations.get(target_lang, "")
            if not translation:
                logger.warning(f"gRPC returned empty translation for {target_lang}")

            processing_time_ms = response.processing_time_ms
            cache_hit = response.cache_hits.get(target_lang, False)

            # HTTP 응답 형식에 맞춰 반환 (호환성)
            cache_lookup_time_ms = 0.1 if cache_hit else 0
            llm_time_ms = 0 if cache_hit else processing_time_ms

            return translation, processing_time_ms, llm_time_ms, cache_lookup_time_ms

        except grpc.RpcError as e:
            # gRPC 프로토콜 에러 (연결 실패, 타임아웃 등)
            logger.error(f"gRPC RpcError for {target_lang}: code={e.code()}, details={e.details()}")
            raise
        except Exception as e:
            # 기타 에러
            logger.error(f"Unexpected error in gRPC translation for {target_lang}: {e}", exc_info=True)
            raise

    def close(self):
        """gRPC 채널 종료 - 명시적으로 호출 필요"""
        if self.channel:
            self.channel.close()
            self.channel = None
            self.stub = None
            logger.info("gRPC channel closed")
