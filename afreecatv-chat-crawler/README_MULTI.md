# AfreecaTV / SoopLive 다중 방송 동시 크롤링

여러 방송 URL을 입력받아 동시에 크롤링하고 번역하는 도구입니다.

## 🚀 기능

- ✅ 여러 방송 URL 동시 크롤링
- ✅ AfreecaTV 및 SoopLive 도메인 모두 지원
- ✅ 실시간 번역 및 WebSocket 브로드캐스트
- ✅ 방송별 메타데이터 포함 (BJ ID, 방송 번호)
- ✅ 다국어 번역 지원 (영어, 태국어, 중국어 등)
- ✅ 쉼표로 구분하여 간편하게 여러 URL 입력

## 📋 사전 준비

### 1. 의존성 설치
```bash
pip install -r requirements.txt
```

### 2. API Gateway 실행
```bash
cd ../api-gateway
npm run dev
```

### 3. Python Worker 실행 (번역 처리)
```bash
cd ../python-worker
python src/main.py
```

### 4. Demo Site 실행 (선택 사항)
```bash
cd ../demo-site
python -m http.server 8080
# http://localhost:8080 접속
```

## 🎯 사용 방법

### 기본 실행
```bash
python multi_broadcaster.py
```

### 실행 과정

1. **방송 URL 입력**
   - 크롤링할 방송 URL을 입력합니다
   - 여러 개는 쉼표로 구분합니다
   - AfreecaTV 및 SoopLive 모두 지원
   - 예시:
     - SoopLive: `https://play.sooplive.co.kr/bjid1/12345, https://play.sooplive.co.kr/bjid2/67890`
     - AfreecaTV: `https://play.afreecatv.com/bjid1/12345`

2. **번역 언어 선택** (쉼표로 구분)
   - `en` - 영어 (기본값)
   - `th` - 태국어
   - `zh-CN` - 중국어(간체)
   - `zh-TW` - 중국어(번체)
   - 예시: `en,th,zh-CN` (영어, 태국어, 중국어 동시 번역)

3. **디버그 모드** (선택)
   - `y` - 상세한 로그 출력
   - `n` - 기본 로그만 출력 (기본값)

### 실행 예시

```bash
$ python multi_broadcaster.py

================================================================================
🎯 AfreecaTV 다중 방송 동시 크롤링
================================================================================

크롤링할 방송 URL을 입력하세요 (여러 개는 쉼표로 구분):
예시: https://play.sooplive.co.kr/bjid1/12345, https://play.sooplive.co.kr/bjid2/67890
      https://play.afreecatv.com/bjid1/12345

방송 URL: https://play.sooplive.co.kr/test1/123, https://play.sooplive.co.kr/test2/456

✅ 2개 방송 URL 발견:
  1. https://play.sooplive.co.kr/test1/123
  2. https://play.sooplive.co.kr/test2/456

번역할 언어를 선택하세요 (쉼표로 구분):
  en - 영어
  th - 태국어
  zh-CN - 중국어(간체)
  zh-TW - 중국어(번체)
언어 (기본값: en): en,th

디버그 모드? (y/N): n

🚀 2개 방송 동시 크롤링 시작!
================================================================================
🚀 방송 #1 (test1) 크롤링 시작...
🚀 방송 #2 (test2) 크롤링 시작...
...
```

### URL 입력 방식

다음과 같은 방식으로 URL을 입력할 수 있습니다:

```bash
# 쉼표로 구분 (SoopLive)
https://play.sooplive.co.kr/bjid1/123, https://play.sooplive.co.kr/bjid2/456

# 공백으로 구분 (AfreecaTV)
https://play.afreecatv.com/bjid1/123 https://play.afreecatv.com/bjid2/456

# 쉼표 + 공백 (혼합)
https://play.sooplive.co.kr/bjid1/123, https://play.afreecatv.com/bjid2/456, https://play.sooplive.co.kr/bjid3/789
```

## 📊 모니터링

### 1. 채팅 모니터링 (Demo Site)
```
http://localhost:8080/index.html
```
- 실시간 채팅 표시
- 원본 / 전처리 / 번역 한 줄에 표시
- BJ 이름, 방송 제목, 시청자 수 표시

### 2. 큐 모니터링 (Dashboard)
```
http://localhost:8080/queue-monitor.html
```
- 처리 속도 (jobs/sec)
- 대기 중인 작업 수
- 평균 처리 시간
- 병목 현상 감지

## 🔧 고급 설정

### 프로그램으로 실행

```python
import asyncio
from multi_broadcaster import run_broadcaster

async def custom_crawler():
    # 크롤링할 방송 URL 리스트 (SoopLive 및 AfreecaTV 혼합 가능)
    broadcast_urls = [
        "https://play.sooplive.co.kr/bjid1/123",
        "https://play.sooplive.co.kr/bjid2/456",
        "https://play.afreecatv.com/bjid3/789",  # AfreecaTV도 가능
    ]

    # 커스텀 옵션
    translation_options = {
        "expandAbbreviations": True,
        "normalizeRepeats": True,
        "removeEmoticons": True,
        "fixTypos": False,  # 맞춤법 교정 비활성화
        "addSpacing": False,  # 띄어쓰기 교정 비활성화
        "filterProfanity": True,  # 욕설 필터링 활성화
    }

    tasks = [
        run_broadcaster(
            afreeca_url=url,
            index=i,
            broadcast_api_url="http://localhost:3000/api/v1/broadcast",
            target_languages=["en", "th"],
            translation_options=translation_options,
            debug=True
        )
        for i, url in enumerate(broadcast_urls, 1)
    ]

    await asyncio.gather(*tasks)

asyncio.run(custom_crawler())
```

## 📝 방송 메타데이터

각 채팅 메시지에는 다음 메타데이터가 포함됩니다:

```json
{
  "message_id": "1234567890_user123",
  "username": "철수",
  "userId": "user123",
  "platform": "afreecatv",
  "timestamp": 1234567890,
  "bj_id": "bjkimchulsoo",
  "broadcast_index": 1
}
```

## 🛑 종료

`Ctrl + C` 를 눌러 모든 크롤러를 안전하게 종료합니다.

## ⚠️ 주의사항

1. **유효한 URL**: AfreecaTV 및 SoopLive 방송 URL만 지원됩니다
   - SoopLive: `play.sooplive.co.kr` 또는 `sooplive.co.kr`
   - AfreecaTV: `play.afreecatv.com` 또는 `afreecatv.com`
2. **라이브 방송**: 크롤링은 현재 진행 중인 라이브 방송만 가능합니다
3. **리소스**: 여러 방송 동시 크롤링은 CPU와 네트워크를 많이 사용합니다
4. **Worker 성능**: Python Worker를 충분한 concurrency로 실행해야 합니다 (30개 이상 권장)
5. **Redis**: Bull 큐가 쌓이지 않도록 Worker 성능을 모니터링하세요

## 🐛 문제 해결

### 채팅이 보이지 않음
- API Gateway가 실행 중인지 확인
- Python Worker가 실행 중인지 확인
- 모니터링 대시보드에서 큐 상태 확인

### 처리 속도가 느림
- Worker concurrency 증가 (`WORKER_CONCURRENCY` 환경변수)
- 모니터링 대시보드에서 병목 확인
- Redis 상태 확인

### 특정 방송만 안 됨
- 방송 URL이 올바른지 확인
  - SoopLive: `https://play.sooplive.co.kr/bjid/번호` 형식
  - AfreecaTV: `https://play.afreecatv.com/bjid/번호` 형식
- 해당 방송이 성인 인증이 필요한 방송인지 확인
- 방송이 실제로 live 상태인지 확인 (종료된 방송은 크롤링 불가)
- 디버그 모드로 실행하여 에러 로그 확인

### URL이 인식되지 않음
- 지원되는 도메인인지 확인:
  - ✅ `sooplive.co.kr` (SoopLive)
  - ✅ `afreecatv.com` (AfreecaTV 구버전)
- 쉼표나 공백으로 구분되어 있는지 확인
- URL 형식이 올바른지 확인 (`https://play.도메인/bjid/번호`)
