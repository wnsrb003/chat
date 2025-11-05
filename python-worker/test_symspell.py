#!/usr/bin/env python3
"""
symspellpy-ko 맞춤법 검사기 테스트
"""
import time
from symspellpy_ko import KoSymSpell
from symspellpy import Verbosity
from loguru import logger


def test_symspell():
    """symspellpy-ko 성능 및 정확도 테스트"""
    logger.info("=== symspellpy-ko Spell Checker Test ===\n")

    # 초기화 시작
    init_start = time.time()
    sym_spell = KoSymSpell(max_dictionary_edit_distance=2, prefix_length=10)

    # 한국어 사전 로드 (음소 분해 적용)
    sym_spell.load_korean_dictionary(decompose_korean=True, load_bigrams=False)

    init_time = (time.time() - init_start) * 1000
    logger.info(f"⏱️  Initialization time: {init_time:.2f}ms\n")

    # 테스트 케이스
    test_cases = [
        "안녕하세요",           # 정상
        "안뇽하세요",           # 오타
        "오늘 날씨가 좋네요",   # 정상
        "오늘 날씨가 조아요",   # 오타
        "되요",                 # 오타 (돼요)
        "됬어요",               # 오타 (됐어요)
        "웬지",                 # 오타 (왠지)
        "할려고",               # 오타 (하려고)
    ]

    total_time = 0
    for text in test_cases:
        start_time = time.time()

        # 맞춤법 교정
        suggestions = sym_spell.lookup(
            text,
            verbosity=Verbosity.CLOSEST,
            max_edit_distance=2
        )

        elapsed = (time.time() - start_time) * 1000
        total_time += elapsed

        if suggestions:
            best = suggestions[0]
            logger.info(f"Input: '{text}'")
            logger.info(f"  → Suggestion: '{best.term}' (distance: {best.distance}, count: {best.count})")
            logger.info(f"  ⏱️  Time: {elapsed:.2f}ms")
        else:
            logger.info(f"Input: '{text}'")
            logger.info(f"  → No suggestions")
            logger.info(f"  ⏱️  Time: {elapsed:.2f}ms")

        logger.info("")

    avg_time = total_time / len(test_cases)
    logger.info(f"📊 Average time per query: {avg_time:.2f}ms")
    logger.info(f"📊 Total time for {len(test_cases)} queries: {total_time:.2f}ms")


if __name__ == "__main__":
    test_symspell()
