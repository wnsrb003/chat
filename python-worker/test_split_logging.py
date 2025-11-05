#!/usr/bin/env python3
"""
CSV 분할 로깅 테스트 (100개씩 + 통합)
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from src.services.translation_logger import TranslationLogger
from loguru import logger


def test_split_logging():
    """CSV 분할 로깅 테스트"""
    logger.info("=== Split Translation CSV Logging Test ===\n")

    # 테스트용으로 10개씩 분할하도록 설정
    test_logger = TranslationLogger(
        log_dir="logs/test_translations",
        records_per_file=10
    )

    # 25개의 번역 로그 생성 (파일 3개로 분할되어야 함)
    logger.info("Logging 25 translations...")
    for i in range(1, 26):
        test_logger.log_translation(
            original_text=f"테스트 {i}",
            preprocessed_text=f"테스트 {i}",
            source_language="ko",
            target_language="en",
            translated_text=f"Test {i}",
            processing_time_ms=100.0 + i,
        )
        if i % 10 == 0:
            logger.info(f"  ... logged {i} records")

    logger.info("\n✅ Logged 25 translations\n")

    # 결과 확인
    log_dir = Path("logs/test_translations")
    today = logger._core.handlers[0]._sink._stream.name.split('/')[-1].split('_')[1].split('.')[0]

    import datetime
    today = datetime.datetime.now().strftime("%Y-%m-%d")

    # 분할 파일 확인
    split_files = sorted(log_dir.glob(f"translations_{today}_*.csv"))
    logger.info(f"📂 Split files created: {len(split_files)}")
    for split_file in split_files:
        with open(split_file, "r", encoding="utf-8-sig") as f:
            record_count = sum(1 for _ in f) - 1  # 헤더 제외
            logger.info(f"  - {split_file.name}: {record_count} records")

    # 통합 파일 확인
    all_file = log_dir / f"translations_{today}_all.csv"
    if all_file.exists():
        with open(all_file, "r", encoding="utf-8-sig") as f:
            total_count = sum(1 for _ in f) - 1  # 헤더 제외
            logger.info(f"\n📁 Unified file: {all_file.name}")
            logger.info(f"  - Total records: {total_count}")


if __name__ == "__main__":
    test_split_logging()
