#!/usr/bin/env python3
"""
CSV 로깅 테스트
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from src.services.translation_logger import translation_logger
from loguru import logger


def test_csv_logging():
    """CSV 로깅 테스트"""
    logger.info("=== Translation CSV Logging Test ===\n")

    # 테스트 케이스 1: 단일 번역
    logger.info("Test 1: Single translation")
    translation_logger.log_translation(
        original_text="안녕하세요",
        preprocessed_text="안녕하세요",
        source_language="ko",
        target_language="en",
        translated_text="Hello",
        processing_time_ms=850.5,
    )
    logger.info("✅ Logged single translation\n")

    # 테스트 케이스 2: 다중 타겟 언어
    logger.info("Test 2: Multiple target languages")
    translation_logger.log_bulk_translations(
        original_text="오늘 날씨가 좋네요",
        preprocessed_text="오늘 날씨가 좋네요",
        source_language="ko",
        translations={
            "en": "The weather is nice today",
            "ja": "今日はいい天気ですね",
            "zh-CN": "今天天气真好",
        },
        processing_time_ms=1250.3,
    )
    logger.info("✅ Logged bulk translations\n")

    # 테스트 케이스 3: 필터링된 텍스트
    logger.info("Test 3: Filtered text")
    translation_logger.log_translation(
        original_text="ㅋㅋㅋㅋㅋㅋ",
        preprocessed_text="하하",
        source_language="ko",
        target_language="en",
        translated_text="[FILTERED]",
        processing_time_ms=5.2,
        filtered=True,
        filter_reason="Only consonants/vowels",
    )
    logger.info("✅ Logged filtered translation\n")

    # 테스트 케이스 4: 전처리 효과 확인
    logger.info("Test 4: Preprocessed text")
    translation_logger.log_translation(
        original_text="안뇽하세요오늘날씨가조아요",
        preprocessed_text="안녕하세요 오늘날씨가 좋아요",
        source_language="ko",
        target_language="en",
        translated_text="Hello, the weather is nice today",
        processing_time_ms=950.7,
    )
    logger.info("✅ Logged preprocessed translation\n")

    # 로그 파일 위치 확인
    log_file = translation_logger._get_log_file()
    logger.info(f"📁 CSV log file: {log_file}")
    logger.info(f"📄 File exists: {log_file.exists()}")

    if log_file.exists():
        logger.info(f"📏 File size: {log_file.stat().st_size} bytes")
        logger.info("\n--- CSV Content (first 5 lines) ---")
        with open(log_file, "r", encoding="utf-8-sig") as f:
            for i, line in enumerate(f):
                if i >= 5:
                    break
                print(line.rstrip())


if __name__ == "__main__":
    test_csv_logging()
