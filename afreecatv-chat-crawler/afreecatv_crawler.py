"""
AfreecaTV 실시간 채팅 크롤러 (개선 버전)
- 클래스 기반 구조로 재사용성 향상
- 콜백 함수를 통한 채팅 데이터 전달
- 번역 API와 쉽게 연동 가능
"""

import certifi
import ssl
import asyncio
import websockets
import time  # 모듈 최상위로 이동 (CPU 최적화)
from typing import Callable, Optional, Dict
from dataclasses import dataclass
from api import get_player_live


@dataclass
class ChatMessage:
    """채팅 메시지 데이터 클래스"""
    user_id: str
    user_nickname: str
    comment: str
    timestamp: float
    raw_data: bytes


class AfreecaTVCrawler:
    """AfreecaTV 실시간 채팅 크롤러"""

    # 유니코드 및 기타 상수
    F = "\x0c"
    ESC = "\x1b\t"

    def __init__(
        self,
        url: str,
        on_chat: Optional[Callable[[ChatMessage], None]] = None,
        on_connect: Optional[Callable[[Dict], None]] = None,
        on_error: Optional[Callable[[Exception], None]] = None,
        debug: bool = False
    ):
        """
        Args:
            url: AfreecaTV 방송 URL (예: https://play.afreecatv.com/{BID}/{BNO})
            on_chat: 채팅 메시지 수신 시 호출되는 콜백 함수
            on_connect: 채팅방 연결 성공 시 호출되는 콜백 함수
            on_error: 에러 발생 시 호출되는 콜백 함수
            debug: 디버그 모드 활성화
        """
        self.url = url
        self.on_chat = on_chat
        self.on_connect = on_connect
        self.on_error = on_error
        self.debug = debug
        self.is_running = False
        self.websocket = None

    def create_ssl_context(self) -> ssl.SSLContext:
        """SSL 컨텍스트 생성"""
        ssl_context = ssl.create_default_context()
        ssl_context.load_verify_locations(certifi.where())
        ssl_context.check_hostname = False
        ssl_context.verify_mode = ssl.CERT_NONE
        return ssl_context

    def decode_message(self, data: bytes) -> Optional[ChatMessage]:
        """
        웹소켓에서 받은 바이트 데이터를 ChatMessage로 디코드

        Returns:
            ChatMessage 또는 None (채팅 메시지가 아닌 경우)
        """
        try:
            parts = data.split(b'\x0c')
            messages = [part.decode('utf-8') for part in parts]

            # 채팅 메시지 형식 검증
            if len(messages) > 6 and messages[1] not in ['-1', '1'] and '|' not in messages[1]:
                user_nickname = messages[6]
                comment = messages[1]

                # 시스템 메시지 필터링 (fw=, afw= 등)
                if 'fw=' in user_nickname or 'afw=' in user_nickname:
                    return None

                # 빈 메시지 필터링
                if not comment or not comment.strip():
                    return None

                # 특수 패턴 필터링 (&가 포함된 시스템 메시지)
                if '&' in user_nickname or '=' in user_nickname:
                    return None

                return ChatMessage(
                    user_id=messages[2],
                    comment=comment,
                    user_nickname=user_nickname,
                    timestamp=time.time(),
                    raw_data=data
                )
        except Exception:
            pass  # CPU 최적화: 디코드 실패 로그 제거

        return None

    def calculate_byte_size(self, string: str) -> int:
        """바이트 크기 계산"""
        return len(string.encode('utf-8')) + 6

    async def ping_loop(self, websocket):
        """주기적으로 핑을 보내서 연결 유지"""
        PING_PACKET = f'{self.ESC}000000000100{self.F}'

        while self.is_running:
            await asyncio.sleep(60)  # 1분마다
            try:
                await websocket.send(PING_PACKET)
                if self.debug:
                    print("[DEBUG] Ping 전송")
            except Exception as e:
                if self.on_error:
                    self.on_error(e)
                break

    async def receive_loop(self, websocket):
        """채팅 메시지를 계속 수신"""
        while self.is_running:
            try:
                data = await websocket.recv()
                message = self.decode_message(data)

                if message and self.on_chat:
                    self.on_chat(message)

            except websockets.exceptions.ConnectionClosed:
                if self.debug:
                    print("[DEBUG] WebSocket 연결 종료됨")
                break
            except Exception as e:
                if self.on_error:
                    self.on_error(e)
                if self.debug:
                    print(f"[DEBUG] 메시지 수신 오류: {e}")

    async def connect(self):
        """채팅방에 연결하고 메시지 수신 시작"""
        try:
            # URL에서 BNO, BID 추출
            BNO = self.url.split('/')[-1]
            BID = self.url.split('/')[-2]

            # API를 통해 채팅 서버 정보 가져오기
            result = get_player_live(BNO, BID)
            if not result:
                raise Exception("API 호출 실패")

            CHDOMAIN, CHATNO, FTK, TITLE, BJID, CHPT = result

            channel_info = {
                "CHDOMAIN": CHDOMAIN,
                "CHATNO": CHATNO,
                "FTK": FTK,
                "TITLE": TITLE,
                "BJID": BJID,
                "CHPT": CHPT,
                "BNO": BNO,
                "BID": BID
            }

            if self.debug:
                print(f"[DEBUG] 채팅방 정보: {channel_info}")

            if self.on_connect:
                self.on_connect(channel_info)

        except Exception as e:
            if self.on_error:
                self.on_error(e)
            raise

        # WebSocket 연결
        ssl_context = self.create_ssl_context()

        try:
            async with websockets.connect(
                f"wss://{CHDOMAIN}:{CHPT}/Websocket/{BID}",
                subprotocols=['chat'],
                ssl=ssl_context,
                ping_interval=None
            ) as websocket:
                self.websocket = websocket
                self.is_running = True

                # 연결 패킷 전송
                CONNECT_PACKET = f'{self.ESC}000100000600{self.F*3}16{self.F}'
                await websocket.send(CONNECT_PACKET)

                if self.debug:
                    print("[DEBUG] 연결 패킷 전송 완료")

                await asyncio.sleep(2)

                # 채팅방 참가 패킷 전송
                JOIN_PACKET = f'{self.ESC}0002{self.calculate_byte_size(CHATNO):06}00{self.F}{CHATNO}{self.F*5}'
                await websocket.send(JOIN_PACKET)

                if self.debug:
                    print("[DEBUG] 채팅방 참가 패킷 전송 완료, 메시지 수신 시작...")

                # 핑/수신 루프 병렬 실행
                await asyncio.gather(
                    self.receive_loop(websocket),
                    self.ping_loop(websocket)
                )

        except Exception as e:
            if self.on_error:
                self.on_error(e)
            if self.debug:
                print(f"[DEBUG] WebSocket 연결 오류: {e}")
        finally:
            self.is_running = False
            self.websocket = None

    async def start(self):
        """크롤러 시작"""
        await self.connect()

    def stop(self):
        """크롤러 정지"""
        self.is_running = False
        if self.websocket:
            asyncio.create_task(self.websocket.close())


# 간단한 사용 예제
async def example():
    """크롤러 사용 예제"""

    def on_chat(message: ChatMessage):
        print(f"[{message.user_nickname}({message.user_id})] {message.comment}")

    def on_connect(channel_info: Dict):
        print(f"✅ 연결됨: {channel_info['TITLE']} (BJ: {channel_info['BJID']})")

    def on_error(error: Exception):
        print(f"❌ 에러: {error}")

    url = input("AfreecaTV URL을 입력하세요: ")

    crawler = AfreecaTVCrawler(
        url=url,
        on_chat=on_chat,
        on_connect=on_connect,
        on_error=on_error,
        debug=True
    )

    await crawler.start()


if __name__ == "__main__":
    asyncio.run(example())
