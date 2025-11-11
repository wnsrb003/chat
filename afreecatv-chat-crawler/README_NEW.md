# AfreecaTV 실시간 채팅 크롤러 + 번역

AfreecaTV의 실시간 채팅을 크롤링하고 번역 API와 연동하여 실시간 번역을 제공합니다.

## 주요 기능

### 1. 기본 크롤러 (`main.py`)
- AfreecaTV 실시간 채팅 크롤링
- 콘솔에 채팅 출력

### 2. 개선된 크롤러 클래스 (`afreecatv_crawler.py`)
- 클래스 기반 구조로 재사용성 향상
- 콜백 함수를 통한 채팅 데이터 전달
- 여러 채팅방 동시 크롤링 가능
- 에러 핸들링 강화

### 3. 실시간 번역 연동 (`realtime_translator.py`)
- 크롤링한 채팅을 번역 API로 전송
- 실시간 번역 결과 출력
- 다국어 번역 지원 (영어, 태국어, 중국어 등)
- 통계 정보 제공

## 설치

### 방법 1: pip + venv (일반적인 방법, 권장)
```bash
# 가상환경 생성
python -m venv venv

# 가상환경 활성화 (Mac/Linux)
source venv/bin/activate

# 가상환경 활성화 (Windows)
venv\Scripts\activate

# 패키지 설치
pip install -r requirements.txt
```

### 방법 2: pipenv (선택사항)
```bash
pipenv install
pipenv shell
```

## 사용 방법

### 1. 기본 크롤러 실행
```bash
python main.py
```
- AfreecaTV URL 입력
- 실시간 채팅이 콘솔에 출력됨

### 2. 실시간 번역 실행 (추천)
```bash
# 먼저 번역 API 서버를 실행해야 합니다
# (chat-translation-service/api-gateway 디렉토리에서)
cd ../api-gateway
npm run dev

# 다른 터미널에서 크롤러 실행
cd ../afreecatv-chat-crawler
python realtime_translator.py
```

입력 예시:
```
AfreecaTV URL: https://play.afreecatv.com/username/12345678
언어 (기본값: en): en,th,zh-CN
```

### 3. 커스텀 사용 (Python 코드에서)

가상환경을 먼저 활성화하세요:
```bash
# Mac/Linux
source venv/bin/activate

# Windows
venv\Scripts\activate
```

#### 기본 크롤러 사용
```python
import asyncio
from afreecatv_crawler import AfreecaTVCrawler, ChatMessage

def on_chat(message: ChatMessage):
    print(f"[{message.user_nickname}] {message.comment}")

async def main():
    crawler = AfreecaTVCrawler(
        url="https://play.afreecatv.com/username/12345678",
        on_chat=on_chat,
        debug=True
    )
    await crawler.start()

asyncio.run(main())
```

#### 번역과 함께 사용
```python
import asyncio
from realtime_translator import RealtimeChatTranslator

async def main():
    translator = RealtimeChatTranslator(
        afreeca_url="https://play.afreecatv.com/username/12345678",
        target_languages=["en", "th"],
        debug=True
    )
    await translator.start()

asyncio.run(main())
```

## API 참고

### ChatMessage 데이터 구조
```python
@dataclass
class ChatMessage:
    user_id: str          # 유저 ID
    user_nickname: str    # 유저 닉네임
    comment: str          # 채팅 내용
    timestamp: float      # 수신 시간 (Unix timestamp)
    raw_data: bytes       # 원본 바이트 데이터
```

### AfreecaTVCrawler 클래스
```python
AfreecaTVCrawler(
    url: str,                                    # AfreecaTV URL
    on_chat: Callable[[ChatMessage], None],      # 채팅 수신 콜백
    on_connect: Callable[[Dict], None],          # 연결 성공 콜백
    on_error: Callable[[Exception], None],       # 에러 콜백
    debug: bool = False                          # 디버그 모드
)
```

### RealtimeChatTranslator 클래스
```python
RealtimeChatTranslator(
    afreeca_url: str,                           # AfreecaTV URL
    translation_api_url: str,                    # 번역 API 엔드포인트
    target_languages: list,                      # 번역 언어 리스트
    translation_options: dict,                   # 번역 옵션
    max_queue_size: int = 100,                  # 번역 큐 크기
    debug: bool = False                          # 디버그 모드
)
```

## 번역 옵션

```python
translation_options = {
    "expandAbbreviations": True,   # 축약어/신조어 확장
    "normalizeRepeats": True,      # 반복 문자 정규화
    "removeEmoticons": True,       # 이모티콘 제거
    "fixTypos": True,              # 맞춤법 교정
    "addSpacing": True,            # 띄어쓰기 교정
    "filterProfanity": False,      # 욕설 필터링
}
```

## 지원 언어

- `en` - 영어
- `th` - 태국어
- `zh-CN` - 중국어(간체)
- `zh-TW` - 중국어(번체)

## 주의사항

1. **번역 API 서버 필요**: `realtime_translator.py` 사용 시 번역 API 서버가 실행 중이어야 합니다.
2. **방송 중인 채널**: AfreecaTV 방송이 진행 중인 채널만 크롤링 가능합니다.
3. **네트워크**: 안정적인 인터넷 연결이 필요합니다.

## 예제 출력

```
================================================================================
✅ 연결됨!
   제목: 롤 솔랭 방송
   BJ: username
   번역 언어: en, th
================================================================================
📥 [유저1] ㅋㅋㅋㅋㅋㅋ
📤 [유저1]
   원본: ㅋㅋㅋㅋㅋㅋ
   전처리: ㅋㅋ
   영어: haha
   태국어: ฮ่าฮ่า
   처리시간: 156ms
--------------------------------------------------------------------------------
📥 [유저2] 오늘날씨 너무 좋다
📤 [유저2]
   원본: 오늘날씨 너무 좋다
   전처리: 오늘날씨 너무 좋다
   영어: The weather is so nice today
   태국어: วันนี้อากาศดีมาก
   처리시간: 203ms
--------------------------------------------------------------------------------
```

## 문제 해결

### SSL 인증서 오류
```bash
pip install --upgrade certifi
```

### WebSocket 연결 실패
- 방송이 진행 중인지 확인
- URL이 올바른지 확인 (예: `https://play.afreecatv.com/BJ_ID/BROADCAST_NO`)

### 번역 API 연결 실패
- 번역 API 서버가 실행 중인지 확인 (`http://localhost:3000`)
- API 서버 로그 확인

## 라이선스

MIT License

## 참고

원본 코드: [블로그 글](https://cha2hyun.blog/content/projects/%EB%B0%B0%EB%8F%8C%EC%9D%B4%EC%9D%98%EB%8B%B9%EA%B5%AC%EC%83%9D%ED%99%9C/afreecatv-crawling/)
