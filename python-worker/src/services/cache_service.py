import httpx
from typing import Dict, List
from loguru import logger
from src.config import settings


class CacheService:
    """Cache 번역 서비스 - 캐싱 서비스 이용"""

    def __init__(self):
        self.url = settings.caching_url
        # self.model = settings.ollama_model
        self.timeout = settings.caching_timeout

    async def translate(
        self,
        text: str,
        source_lang: str,
        target_languages: List[str]
    ) -> tuple[str,float,float]:
        """
        텍스트를 여러 언어로 번역

        Args:
            text: 번역할 텍스트
            source_lang: 원본 언어 코드
            target_languages: 타겟 언어 코드 리스트

        Returns:
            언어 코드별 번역 결과 딕셔너리
        """
        translations = {}
        # Initialize timing metrics with default values
        translate_processing_time_ms = -1.0
        translate_llm_time_ms = -1.0
        translate_cache_hit_time_ms = -1.0

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            for target_lang in target_languages:
                try:
                    translation, translate_processing_time_ms, translate_llm_time_ms, translate_cache_hit_time_ms  = await self._translate_single(
                        client, text, source_lang, target_lang
                    )
                    translations[target_lang] = translation
                except Exception as e:
                    logger.error(
                        f"Translation failed for {target_lang}: {e}"
                    )
                    translations[target_lang] = f"[Translation Error: {str(e)}]"

        return translations, translate_processing_time_ms, translate_llm_time_ms, translate_cache_hit_time_ms

    async def _translate_single(
        self,
        client: httpx.AsyncClient,
        text: str,
        source_lang: str,
        target_lang: str
    ) -> tuple[str, float, float, float]:
        """단일 언어로 번역"""

        # 언어 코드 변환
        lang_map = {
            "ko": "ko",
            "en": "en",
            "th": "th",
            "zh-CN": "zh-CN",
            "zh-TW": "zh-TW"
        }

        source_lang_name = lang_map.get(source_lang, source_lang)
        target_lang_name = lang_map.get(target_lang, target_lang)

        # 캐싱 서버 API 형식 (허드슨)
        cache_strategy = 'hybrid'
        payload = {
            "cache_strategy": cache_strategy,
            "source_lang": source_lang,
            "target_langs" : [target_lang],
            "text": text,
            "user_cache" : True
        }

        logger.info(f"Requesting Caching translation: {source_lang} → {target_lang}")

        # Ollama OpenAI 호환 엔드포인트 사용
        response = await client.post(
            self.url + '?translator=vllm',
            # self.url + '?translator=ollama',
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=self.timeout
        )
        response.raise_for_status()

        result = response.json()
        # 응답 형식에서 번역 추출
        translation = result["translations"][target_lang].strip()
        translate_processing_time_ms = result["processing_time_ms"]
        translate_cache_hit_time_ms = result["cache_lookup_time_ms"]
        translate_llm_time_ms = result["llm_response_time_ms"][target_lang]
        
        logger.info(f"Translation result: '{text}' → '{translation}', {result}")

        return translation, translate_processing_time_ms,translate_llm_time_ms, translate_cache_hit_time_ms
