#!/usr/bin/env python3
"""
Ollama 번역 서비스 테스트 스크립트
"""
import asyncio
import sys
import time
from pathlib import Path

# 프로젝트 루트를 Python 경로에 추가
sys.path.insert(0, str(Path(__file__).parent))

from src.services.ollama_service import OllamaService
from loguru import logger


async def test_translation():
    """번역 테스트"""
    logger.info("=== Ollama Translation Service Test ===\n")

    service = OllamaService()

    test_cases = [
        {
            "text": "안녕하세요",
            "source_lang": "ko",
            "target_languages": ["en"],
        },
        {
            "text": "오늘 날씨가 정말 좋네요",
            "source_lang": "ko",
            "target_languages": ["en", "ja"],
        },
        {
            "text": "Hello, how are you?",
            "source_lang": "en",
            "target_languages": ["ko"],
        },
    ]

    for i, test_case in enumerate(test_cases, 1):
        logger.info(f"\n--- Test Case {i} ---")
        logger.info(f"Input: {test_case['text']}")
        logger.info(f"Source: {test_case['source_lang']}")
        logger.info(f"Targets: {test_case['target_languages']}")

        start_time = time.time()

        try:
            translations = await service.translate(
                text=test_case["text"],
                source_lang=test_case["source_lang"],
                target_languages=test_case["target_languages"]
            )

            elapsed = time.time() - start_time

            logger.info(f"\n✅ Translations:")
            for lang, translation in translations.items():
                logger.info(f"  {lang}: {translation}")

            logger.info(f"\n⏱️  Total time: {elapsed:.2f}s ({elapsed*1000:.0f}ms)")

        except Exception as e:
            logger.error(f"❌ Error: {e}", exc_info=True)

        logger.info("-" * 50)


if __name__ == "__main__":
    asyncio.run(test_translation())
