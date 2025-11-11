"""
AfreecaTV 다중 방송 동시 크롤링
사용자가 입력한 여러 방송 URL을 동시에 크롤링하고 번역
"""

import asyncio
from typing import List, Dict
from realtime_broadcaster import RealtimeBroadcaster


def parse_broadcast_urls(urls_input: str) -> List[str]:
    """
    사용자 입력에서 방송 URL 추출

    Args:
        urls_input: 쉼표, 공백, 줄바꿈으로 구분된 URL 문자열

    Returns:
        URL 리스트
    """
    # 쉼표, 줄바꿈, 공백으로 분리
    urls = []
    for line in urls_input.replace(',', '\n').split('\n'):
        url = line.strip()
        # AfreecaTV와 SoopLive 도메인 모두 지원
        if url and ('afreecatv.com' in url or 'play.afreecatv.com' in url or 'sooplive.co.kr' in url):
            urls.append(url)
    return urls


async def run_broadcaster(
    afreeca_url: str,
    index: int,
    broadcast_api_url: str,
    target_languages: List[str],
    translation_options: Dict,
    debug: bool = False
):
    """
    개별 방송 크롤러 실행

    Args:
        afreeca_url: 방송 URL
        index: 방송 번호 (표시용)
        broadcast_api_url: API 엔드포인트
        target_languages: 번역 언어
        translation_options: 번역 옵션
        debug: 디버그 모드
    """
    try:
        # URL에서 BJ ID 추출
        bj_id = ""
        if '/play/' in afreeca_url or 'play.afreecatv.com' in afreeca_url:
            parts = afreeca_url.split('/')
            if len(parts) >= 4:
                bj_id = parts[-2]

        # 방송 메타데이터 생성
        broadcast_metadata = {
            "bj_id": bj_id,
            "broadcast_index": index,
        }

        broadcaster = RealtimeBroadcaster(
            afreeca_url=afreeca_url,
            broadcast_api_url=broadcast_api_url,
            target_languages=target_languages,
            translation_options=translation_options,
            debug=debug,
            broadcast_metadata=broadcast_metadata
        )

        print(f"🚀 방송 #{index} ({bj_id}) 크롤링 시작...")
        await broadcaster.start()

    except Exception as e:
        print(f"❌ 방송 #{index} 크롤링 오류: {e}")


async def main():
    """메인 함수 - 여러 방송 동시 크롤링"""
    print("=" * 80)
    print("🎯 AfreecaTV 다중 방송 동시 크롤링")
    print("=" * 80)
    print()

    # 설정
    broadcast_api_url = "http://localhost:3000/api/v1/broadcast"

    # 방송 URL 입력
    print("크롤링할 방송 URL을 입력하세요 (여러 개는 쉼표로 구분):")
    print("예시: https://play.sooplive.co.kr/bjid1/12345, https://play.sooplive.co.kr/bjid2/67890")
    print("      https://play.afreecatv.com/bjid1/12345")
    print()
    urls_input = input("방송 URL: ").strip()

    if not urls_input:
        print("❌ URL을 입력하지 않았습니다.")
        return

    # URL 파싱
    broadcast_urls = parse_broadcast_urls(urls_input)

    if not broadcast_urls:
        print("❌ 유효한 방송 URL을 찾을 수 없습니다. (sooplive.co.kr 또는 afreecatv.com)")
        return

    print(f"\n✅ {len(broadcast_urls)}개 방송 URL 발견:")
    for i, url in enumerate(broadcast_urls, 1):
        print(f"  {i}. {url}")

    # 번역 언어 선택
    print("\n번역할 언어를 선택하세요 (쉼표로 구분):")
    print("  en - 영어")
    print("  th - 태국어")
    print("  zh-CN - 중국어(간체)")
    print("  zh-TW - 중국어(번체)")
    lang_input = input("언어 (기본값: 전체): ").strip()

    if lang_input:
        target_languages = [lang.strip() for lang in lang_input.split(",")]
    else:
        target_languages = ["en", "th", "zh-CN", "zh-TW"]

    # 디버그 모드
    debug_input = input("\n디버그 모드? (y/N): ").strip().lower()
    debug = debug_input == 'y'

    # 번역 옵션
    translation_options = {
        "expandAbbreviations": True,
        "normalizeRepeats": True,
        "removeEmoticons": True,
        "fixTypos": True,
        "addSpacing": True,
        "filterProfanity": False,
    }

    print(f"\n🚀 {len(broadcast_urls)}개 방송 동시 크롤링 시작!")
    print("=" * 80)

    # 모든 방송을 동시에 크롤링
    tasks = [
        run_broadcaster(
            afreeca_url=url,
            index=i,
            broadcast_api_url=broadcast_api_url,
            target_languages=target_languages,
            translation_options=translation_options,
            debug=debug
        )
        for i, url in enumerate(broadcast_urls, 1)
    ]

    try:
        await asyncio.gather(*tasks)
    except KeyboardInterrupt:
        print("\n\n⏸️  크롤링 중단됨 (Ctrl+C)")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n프로그램 종료")
