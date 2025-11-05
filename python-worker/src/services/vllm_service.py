import httpx
from typing import Dict, List
from loguru import logger
from src.config import settings


class VLLMService:
    """VLLM 번역 서비스"""

    def __init__(self):
        self.url = settings.vllm_url
        self.timeout = settings.vllm_timeout

    async def translate(
        self,
        text: str,
        source_lang: str,
        target_languages: List[str]
    ) -> Dict[str, str]:
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

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            for target_lang in target_languages:
                try:
                    translation = await self._translate_single(
                        client, text, source_lang, target_lang
                    )
                    translations[target_lang] = translation
                except Exception as e:
                    logger.error(
                        f"Translation failed for {target_lang}: {e}"
                    )
                    translations[target_lang] = f"[Translation Error: {str(e)}]"

        return translations

    async def _translate_single(
        self,
        client: httpx.AsyncClient,
        text: str,
        source_lang: str,
        target_lang: str
    ) -> str:
        """단일 언어로 번역"""

        # 언어 코드 변환
        lang_map = {
            "ko": "Korean",
            "en": "English",
            "th": "Thai",
            "zh-CN": "Simplified Chinese",
            "zh-TW": "Traditional Chinese",
            "ja": "Japanese",
            "es": "Spanish",
            "fr": "French",
            "de": "German",
            "ru": "Russian",
        }
        

        source_lang_name = lang_map.get(source_lang, source_lang)
        target_lang_name = lang_map.get(target_lang, target_lang)

        prompt = f"""{text}"""

        payload = {
            "model": "gaunernst/gemma-3-4b-it-int4-awq",  # VLLM 서버에 로드된 모델 이름
            "messages": [
                {"role": "system", "name": "source_language", "content": source_lang_name},
                {"role": "system", "name": "target_language", "content": target_lang_name},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.3,
            "max_tokens": 100,
            "seed": 42,  # 일관된 결과를 위한 시드
            "repetition_penalty": 1.1, # 반복 페널티
            "frequency_penalty": 0.2,
            "presence_penalty": 0.1
        }

        logger.info(f"Requesting VLLM translation: {source_lang} → {target_lang}")

        response = await client.post(self.url, json=payload, headers={"Content-Type": "application/json"}, timeout=30)
        response.raise_for_status()

        result = response.json()

        # OpenAI 호환 응답 형식에서 번역 추출
        translation = result["choices"][0]["message"]["content"].strip()

        logger.info(f"Translation result: '{text}' → '{translation}'")

        return translation
