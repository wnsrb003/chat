#!/usr/bin/env python3
"""
전처리기 통합 테스트 (symspell + 패턴)
"""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from src.preprocessor.text_processor import TextPreprocessor
from loguru import logger


def test_preprocessor():
    """전처리기 성능 및 품질 테스트"""
    logger.info("=== Text Preprocessor Test (symspell + patterns) ===\n")

    # 초기화
    init_start = time.time()
    preprocessor = TextPreprocessor()
    init_time = (time.time() - init_start) * 1000
    logger.info(f"⏱️  Initialization time: {init_time:.2f}ms\n")

    # 테스트 케이스
    test_cases = [
        {
            "text": "안녕하세요 반갑습니다",
            "desc": "정상 텍스트"
        },
        {
            "text": "안뇽하세요 반갑습니다",
            "desc": "오타: 안뇽 → 안녕"
        },
        {
            "text": "오늘 날씨가 조아요",
            "desc": "오타: 조아요 (복합)"
        },
        {
            "text": "되요 안되요",
            "desc": "오타: 되요 → 돼요 (패턴으로 교정)"
        },
        {
            "text": "됬어요 됬습니다",
            "desc": "오타: 됬어요 → 됐어요 (패턴으로 교정)"
        },
        {
            "text": "웬지 이상해요",
            "desc": "오타: 웬지 → 왠지 (symspell)"
        },
        {
            "text": "할려고 했어요",
            "desc": "오타: 할려고 → 하려고 (패턴으로 교정)"
        },
        {
            "text": "ㅋㅋㅋㅋㅋㅋ 진짜 웃겨ㅋㅋㅋ",
            "desc": "반복 문자"
        },
        {
            "text": "ㅎㅇ ㄱㅊ?",
            "desc": "축약어"
        },
        {
            "text": "오늘날씨가좋네요",
            "desc": "띄어쓰기 오류"
        },
    ]

    total_time = 0
    for i, test_case in enumerate(test_cases, 1):
        logger.info(f"--- Test {i}: {test_case['desc']} ---")
        logger.info(f"Input: '{test_case['text']}'")

        start_time = time.time()

        # 전처리 실행 (fix_typos=True)
        preprocessed, filtered, filter_reason = preprocessor.preprocess(
            text=test_case['text'],
            expand_abbreviations=True,
            filter_profanity=False,
            normalize_repeats=True,
            remove_emoticons=False,
            fix_typos=True,  # symspell + 패턴 적용
            add_spacing=False,  # 띄어쓰기는 선택적
        )

        elapsed = (time.time() - start_time) * 1000
        total_time += elapsed

        if filtered:
            logger.info(f"❌ Filtered: {filter_reason}")
        else:
            logger.info(f"Output: '{preprocessed}'")

        logger.info(f"⏱️  Time: {elapsed:.2f}ms\n")

    avg_time = total_time / len(test_cases)
    logger.info(f"📊 Average preprocessing time: {avg_time:.2f}ms")
    logger.info(f"📊 Total time for {len(test_cases)} cases: {total_time:.2f}ms")


if __name__ == "__main__":
    test_preprocessor()
