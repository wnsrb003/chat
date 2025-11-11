"""
AfreecaTV 실시간 채팅 크롤러 + WebSocket 브로드캐스터
채팅을 크롤링하고 번역 API로 보내서 WebSocket으로 브로드캐스트
"""

import asyncio
import aiohttp
import time
from typing import Optional
from afreecatv_crawler import AfreecaTVCrawler, ChatMessage


class RealtimeBroadcaster:
    """실시간 채팅 크롤러 + WebSocket 브로드캐스터"""

    def __init__(
        self,
        afreeca_url: str,
        broadcast_api_url: str = "http://localhost:3000/api/v1/broadcast",
        target_languages: list = ["en"],
        translation_options: Optional[dict] = None,
        max_queue_size: int = 100,
        debug: bool = False,
        broadcast_metadata: Optional[dict] = None
    ):
        """
        Args:
            afreeca_url: AfreecaTV 방송 URL
            broadcast_api_url: 브로드캐스트 API 엔드포인트
            target_languages: 번역할 언어 목록
            translation_options: 번역 옵션
            max_queue_size: 번역 큐 최대 크기
            debug: 디버그 모드
            broadcast_metadata: 방송 메타데이터 (BJ 이름, 시청자 수 등)
        """
        self.afreeca_url = afreeca_url
        self.broadcast_api_url = broadcast_api_url
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
        self.broadcast_metadata = broadcast_metadata or {}

        self.crawler = None
        self.is_running = False
        self.session = None  # 재사용할 aiohttp 세션

        # 통계
        self.stats = {
            "total_chats": 0,
            "total_broadcasted": 0,
            "total_errors": 0,
            "start_time": None,
        }

    def on_chat_message(self, message: ChatMessage):
        """채팅 메시지 수신 콜백"""
        self.stats["total_chats"] += 1

        # 콘솔 출력 (CPU 최적화: 10개마다만 출력)
        if self.debug or self.stats["total_chats"] % 10 == 0:
            print(f"📥 [{self.stats['total_chats']}] [{message.user_nickname}] {message.comment}")

        # 원본 메시지 즉시 브로드캐스트 (번역 없이)
        asyncio.create_task(self.broadcast_original(message))

        # 번역 즉시 시작 (병렬 처리)
        asyncio.create_task(self.translate_and_broadcast(message))

    def on_connect(self, channel_info: dict):
        """채팅방 연결 성공 콜백"""
        print("=" * 80)
        print(f"✅ AfreecaTV 연결 성공!")
        print(f"   제목: {channel_info['TITLE']}")
        print(f"   BJ: {channel_info['BJID']}")
        print(f"   번역 언어: {', '.join(self.target_languages)}")
        print(f"   브로드캐스트: WebSocket")
        print("=" * 80)

    def on_error(self, error: Exception):
        """에러 발생 콜백"""
        self.stats["total_errors"] += 1
        print(f"❌ 에러: {error}")

    async def broadcast_original(self, message: ChatMessage):
        """원본 메시지 즉시 브로드캐스트 (번역 전)"""
        try:
            # WebSocket으로 원본만 전송
            payload = {
                "type": "chat_original",
                "data": {
                    "message_id": f"{message.timestamp}_{message.user_id}",
                    "username": message.user_nickname,
                    "userId": message.user_id,
                    "text": message.comment,
                    "timestamp": message.timestamp,
                    "platform": "afreecatv",
                    **self.broadcast_metadata  # 방송 메타데이터 추가
                }
            }

            # 재사용 가능한 세션으로 HTTP POST (WebSocket 브로드캐스트 트리거)
            async with self.session.post(
                self.broadcast_api_url.replace('/broadcast', '/broadcast-ws'),
                json=payload,
                timeout=aiohttp.ClientTimeout(total=0.5)  # 더 짧은 타임아웃
            ) as response:
                pass  # CPU 최적화: 디버그 로그 제거
        except Exception:
            pass  # CPU 최적화: 에러 로그 제거

    async def translate_and_broadcast(self, message: ChatMessage):
        """개별 메시지를 번역하고 브로드캐스트 (병렬 처리)"""
        try:
            # 번역 API 호출 (브로드캐스트)
            payload = {
                "text": message.comment,
                "targetLanguages": self.target_languages,
                "options": self.translation_options,
                "metadata": {
                    "message_id": f"{message.timestamp}_{message.user_id}",
                    "username": message.user_nickname,
                    "userId": message.user_id,
                    "platform": "afreecatv",
                    "timestamp": message.timestamp,
                    **self.broadcast_metadata  # 방송 메타데이터 추가
                }
            }

            # 재사용 가능한 세션으로 POST (CPU 최적화: start_time 제거)
            async with self.session.post(
                self.broadcast_api_url,
                json=payload,
                timeout=aiohttp.ClientTimeout(total=3)  # 3초 (큐 대기 시간 고려)
            ) as response:
                if response.status == 200 or response.status == 202:
                    result = await response.json()

                    if result.get("success"):
                        self.stats["total_broadcasted"] += 1
                        # CPU 최적화: elapsed, 디버그 로그 제거

                    else:
                        print(f"⚠️  브로드캐스트 실패: {result.get('error', 'Unknown')}")
                else:
                    print(f"⚠️  API 오류: HTTP {response.status}")

        except asyncio.CancelledError:
            pass
        except Exception:
            self.stats["total_errors"] += 1
            # CPU 최적화: 에러 로그 제거

    async def start(self):
        """실시간 브로드캐스터 시작"""
        self.is_running = True
        self.stats["start_time"] = time.time()

        # HTTP 세션 생성 (재사용)
        self.session = aiohttp.ClientSession()

        # 크롤러 생성
        self.crawler = AfreecaTVCrawler(
            url=self.afreeca_url,
            on_chat=self.on_chat_message,
            on_connect=self.on_connect,
            on_error=self.on_error,
            debug=self.debug
        )

        # 크롤러 실행
        try:
            await self.crawler.start()
        except KeyboardInterrupt:
            print("\n\n중단됨 (Ctrl+C)")
        finally:
            await self.stop()

    async def stop(self):
        """브로드캐스터 정지"""
        self.is_running = False
        if self.crawler:
            self.crawler.stop()

        # HTTP 세션 종료
        if self.session:
            await self.session.close()

        # 통계 출력
        if self.stats["start_time"]:
            elapsed = time.time() - self.stats["start_time"]
            print("\n" + "=" * 80)
            print("📊 통계")
            print(f"   실행 시간: {elapsed:.1f}초")
            print(f"   총 채팅: {self.stats['total_chats']}개")
            print(f"   브로드캐스트: {self.stats['total_broadcasted']}개")
            print(f"   에러: {self.stats['total_errors']}개")
            if self.stats['total_broadcasted'] > 0:
                print(f"   평균 처리: {self.stats['total_chats'] / elapsed:.1f}개/초")
            print("=" * 80)


async def main():
    """메인 함수"""
    print("=" * 80)
    print("AfreecaTV 실시간 채팅 → WebSocket 브로드캐스터")
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

    # 디버그 모드
    debug_input = input("\n디버그 모드? (y/N): ").strip().lower()
    debug = debug_input == 'y'

    print()

    # 브로드캐스터 생성 및 시작
    broadcaster = RealtimeBroadcaster(
        afreeca_url=afreeca_url,
        target_languages=target_languages,
        debug=debug
    )

    await broadcaster.start()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n프로그램 종료")
