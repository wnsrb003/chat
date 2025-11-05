#!/usr/bin/env python3
"""
띄어쓰기 보호 패턴 테스트
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from src.preprocessor.text_processor import TextPreprocessor
from loguru import logger


def test_spacing_protection():
    """띄어쓰기 보호 패턴 테스트"""
    logger.info("=== Spacing Protection Pattern Test ===\n")

    preprocessor = TextPreprocessor()

    test_cases = [
        {
            "text": "오늘날씨가좋네요",
            "desc": "보호 패턴: 오늘날씨 (붙여쓰기 유지)"
        },
        {
            "text": "어제날씨가안좋았어요",
            "desc": "보호 패턴: 어제날씨 (붙여쓰기 유지)"
        },
        {
            "text": "내일날씨는어떨까요",
            "desc": "보호 패턴 없음 (정상 띄어쓰기)"
        },
        {
            "text": "오늘날씨가좋네요그래서산책갔어요",
            "desc": "혼합: 보호 + 정상 띄어쓰기"
        },
    ]

    for i, test_case in enumerate(test_cases, 1):
        logger.info(f"--- Test {i}: {test_case['desc']} ---")
        logger.info(f"Input: '{test_case['text']}'")

        # 띄어쓰기 교정 실행
        result = preprocessor.add_spacing(test_case['text'])

        logger.info(f"Output: '{result}'")
        logger.info("")


if __name__ == "__main__":
    test_spacing_protection()
