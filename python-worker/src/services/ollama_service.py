import httpx
from typing import Dict, List
from loguru import logger
from src.config import settings


class OllamaService:
    """Ollama 번역 서비스 - gemma3-translator 1B 모델"""

    def __init__(self):
        self.url = settings.ollama_url
        self.model = settings.ollama_model
        self.timeout = settings.ollama_timeout

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

        # Ollama API 형식 (OpenAI 호환)
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": f"Translate from {source_lang_name} to {target_lang_name}. Only output the translated text, nothing else."},
                {"role": "user", "content": text}
            ],
            "stream": False
        }

        logger.info(f"Requesting Ollama translation: {source_lang} → {target_lang}")

        # Ollama OpenAI 호환 엔드포인트 사용
        response = await client.post(
            self.url,
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=self.timeout
        )
        response.raise_for_status()

        result = response.json()

        # OpenAI 호환 응답 형식에서 번역 추출
        translation = result["message"]["content"].strip()

        logger.info(f"Translation result: '{text}' → '{translation}'")

        return translation
