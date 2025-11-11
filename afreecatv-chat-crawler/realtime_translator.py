"""
AfreecaTV 실시간 채팅 크롤러 + 번역 API 연동
채팅을 실시간으로 크롤링하고 번역 API로 전송
"""

import asyncio
import aiohttp
import time
from typing import Optional
from afreecatv_crawler import AfreecaTVCrawler, ChatMessage


class RealtimeChatTranslator:
    """실시간 채팅 번역기"""

    def __init__(
        self,
        afreeca_url: str,
        translation_api_url: str = "http://localhost:3000/api/v1/translate",
        target_languages: list = ["en"],
        translation_options: Optional[dict] = None,
        max_queue_size: int = 100,
        debug: bool = False
    ):
        """
        Args:
            afreeca_url: AfreecaTV 방송 URL
            translation_api_url: 번역 API 엔드포인트
            target_languages: 번역할 언어 목록 (예: ["en", "th", "zh-CN"])
            translation_options: 번역 옵션 (전처리 옵션 등)
            max_queue_size: 번역 큐 최대 크기
            debug: 디버그 모드
        """
        self.afreeca_url = afreeca_url
        self.translation_api_url = translation_api_url
        self.target_languages = target_languages
        self.translation_options = translation_options or {
            "expandAbbreviations": True,
            "normalizeRepeats": True,
            "removeEmoticons": True,
            "fixTypos": True,
            "addSpacing": True,
            "filterProfanity": False,
        }
        self.max_queue_size = max_queue_size
        self.debug = debug

        self.crawler = None
        self.translation_queue = asyncio.Queue(maxsize=max_queue_size)
        self.is_running = False

        # 통계
        self.stats = {
            "total_chats": 0,
            "total_translated": 0,
            "total_errors": 0,
            "start_time": None,
        }

    def on_chat_message(self, message: ChatMessage):
        """채팅 메시지 수신 콜백"""
        self.stats["total_chats"] += 1

        # 큐에 추가 (큐가 가득 찬 경우 가장 오래된 메시지 버림)
        try:
            self.translation_queue.put_nowait(message)
        except asyncio.QueueFull:
            if self.debug:
                print("[DEBUG] 번역 큐가 가득 참, 오래된 메시지 버림")
            # 가장 오래된 것 하나 제거
            try:
                self.translation_queue.get_nowait()
                self.translation_queue.put_nowait(message)
            except:
                pass

        # 콘솔 출력
        print(f"📥 [{message.user_nickname}] {message.comment}")

    def on_connect(self, channel_info: dict):
        """채팅방 연결 성공 콜백"""
        print("=" * 80)
        print(f"✅ 연결됨!")
        print(f"   제목: {channel_info['TITLE']}")
        print(f"   BJ: {channel_info['BJID']}")
        print(f"   번역 언어: {', '.join(self.target_languages)}")
        print("=" * 80)

    def on_error(self, error: Exception):
        """에러 발생 콜백"""
        self.stats["total_errors"] += 1
        print(f"❌ 에러: {error}")

    async def translate_worker(self):
        """번역 작업자 (큐에서 메시지를 가져와 번역 API 호출)"""
        async with aiohttp.ClientSession() as session:
            while self.is_running:
                try:
                    # 큐에서 메시지 가져오기 (타임아웃 1초)
                    try:
                        message = await asyncio.wait_for(
                            self.translation_queue.get(),
                            timeout=1.0
                        )
                    except asyncio.TimeoutError:
                        continue

                    # 번역 API 호출
                    payload = {
                        "text": message.comment,
                        "targetLanguages": self.target_languages,
                        "options": self.translation_options
                    }

                    start_time = time.time()

                    async with session.post(
                        self.translation_api_url,
                        json=payload,
                        timeout=aiohttp.ClientTimeout(total=10)
                    ) as response:
                        if response.status == 200:
                            result = await response.json()

                            if result.get("success"):
                                elapsed = (time.time() - start_time) * 1000
                                self.stats["total_translated"] += 1

                                # 번역 결과 출력
                                data = result.get("data", {})
                                preprocessed = data.get("preprocessed_text", "")
                                translations = data.get("translations", {})

                                print(f"📤 [{message.user_nickname}]")
                                print(f"   원본: {message.comment}")
                                if preprocessed and preprocessed != message.comment:
                                    print(f"   전처리: {preprocessed}")
                                for lang, text in translations.items():
                                    lang_name = {
                                        "en": "영어",
                                        "th": "태국어",
                                        "zh-CN": "중국어(간체)",
                                        "zh-TW": "중국어(번체)"
                                    }.get(lang, lang)
                                    print(f"   {lang_name}: {text}")
                                print(f"   처리시간: {elapsed:.0f}ms")
                                print("-" * 80)
                            else:
                                print(f"⚠️  번역 실패: {result.get('error', 'Unknown error')}")
                        else:
                            print(f"⚠️  API 오류: HTTP {response.status}")

                except asyncio.CancelledError:
                    break
                except Exception as e:
                    self.stats["total_errors"] += 1
                    if self.debug:
                        print(f"[DEBUG] 번역 작업자 오류: {e}")

    async def start(self):
        """실시간 번역 시작"""
        self.is_running = True
        self.stats["start_time"] = time.time()

        # 크롤러 생성
        self.crawler = AfreecaTVCrawler(
            url=self.afreeca_url,
            on_chat=self.on_chat_message,
            on_connect=self.on_connect,
            on_error=self.on_error,
            debug=self.debug
        )

        # 크롤러와 번역 작업자 병렬 실행
        try:
            await asyncio.gather(
                self.crawler.start(),
                self.translate_worker()
            )
        except KeyboardInterrupt:
            print("\n\n중단됨 (Ctrl+C)")
        finally:
            self.stop()

    def stop(self):
        """실시간 번역 정지"""
        self.is_running = False
        if self.crawler:
            self.crawler.stop()

        # 통계 출력
        if self.stats["start_time"]:
            elapsed = time.time() - self.stats["start_time"]
            print("\n" + "=" * 80)
            print("📊 통계")
            print(f"   실행 시간: {elapsed:.1f}초")
            print(f"   총 채팅: {self.stats['total_chats']}개")
            print(f"   번역 완료: {self.stats['total_translated']}개")
            print(f"   에러: {self.stats['total_errors']}개")
            if self.stats['total_translated'] > 0:
                print(f"   평균 처리: {self.stats['total_chats'] / elapsed:.1f}개/초")
            print("=" * 80)


async def main():
    """메인 함수"""
    print("=" * 80)
    print("AfreecaTV 실시간 채팅 번역기")
    print("=" * 80)
    print()

    # 사용자 입력
    afreeca_url = input("AfreecaTV URL: ").strip()

    print("\n번역할 언어를 선택하세요 (쉼표로 구분):")
    print("  en - 영어")
    print("  th - 태국어")
    print("  zh-CN - 중국어(간체)")
    print("  zh-TW - 중국어(번체)")
    lang_input = input("언어 (기본값: en): ").strip()

    if lang_input:
        target_languages = [lang.strip() for lang in lang_input.split(",")]
    else:
        target_languages = ["en"]

    print()

    # 번역기 생성 및 시작
    translator = RealtimeChatTranslator(
        afreeca_url=afreeca_url,
        target_languages=target_languages,
        debug=False
    )

    await translator.start()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n프로그램 종료")
