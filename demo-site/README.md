# 실시간 채팅 번역 데모 사이트

실제 채팅 데이터(`broad_chat.csv`)를 사용해서 번역 시스템을 테스트할 수 있는 데모 웹사이트입니다.

## 기능

- 📝 **실제 채팅 데이터 로드**: `broad_chat.csv`에서 200개 채팅 표시
- 🔄 **실시간 번역**: WebSocket 또는 HTTP API 사용
- ⚙️ **전처리 옵션**: 자음 축약어, 반복 문자, 이모티콘 등
- 🌍 **다국어 지원**: 영어, 일본어, 중국어, 스페인어
- 📊 **통계**: 번역 횟수, 평균 처리 시간

## 실행 방법

### 1. 전체 시스템 실행

먼저 번역 서비스가 실행되어야 합니다:

```bash
# chat-translation-service 디렉토리에서
cd ../chat-translation-service
docker-compose up -d

# 또는 개별 실행
# Terminal 1: Redis
docker run -d -p 6379:6379 redis:7-alpine

# Terminal 2: API Gateway
cd api-gateway
npm install
npm run dev

# Terminal 3: Python Worker
cd python-worker
pip install -r requirements.txt
python -m src.worker
```

### 2. 데모 사이트 실행

```bash
cd demo-site
node server.js
```

### 3. 브라우저에서 접속

```
http://localhost:8080
```

## 사용 방법

1. **채팅 선택**: 왼쪽 패널에서 실제 채팅을 클릭
2. **또는 직접 입력**: 오른쪽 입력창에 텍스트 입력
3. **옵션 선택**: 전처리 옵션 체크/해제
4. **언어 선택**: 번역할 언어 선택 (여러 개 가능)
5. **번역하기**: 버튼 클릭
6. **결과 확인**: 전처리 과정 및 번역 결과 표시

## 화면 구성

```
┌─────────────────────────────────────────────────────┐
│  통계: 전체 채팅 | 번역 완료 | 평균 처리시간         │
├──────────────────────┬──────────────────────────────┤
│  실제 채팅 데이터     │  번역                         │
│  ┌────────────────┐  │  ┌────────────────────────┐  │
│  │ 채팅 1         │  │  │ [입력창]               │  │
│  │ 채팅 2         │  │  │                        │  │
│  │ 채팅 3 (선택)  │  │  └────────────────────────┘  │
│  │ ...            │  │  [전처리 옵션]                │
│  └────────────────┘  │  [언어 선택] [번역하기]       │
│                      │  [결과 표시]                  │
└──────────────────────┴──────────────────────────────┘
```

## 테스트 예시

### 예시 1: 반복 문자 정규화
```
입력: ㅋㅋㅋㅋㅋㅋㅋㅋ 이거 ㄹㅈㄷ
전처리: ㅋㅋ 이거 레전드
영어: LOL this is legendary
```

### 예시 2: 태그 제거
```
입력: [C9]족구련 ㅊㄱㅇ
전처리: 족구련 축하해요
영어: Jokguryon, congratulations
```

### 예시 3: 필터링
```
입력: ㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋ
결과: ⚠️ 필터링됨 (Only consonants/vowels)
```

## 주요 파일

- `index.html`: 메인 HTML (UI)
- `app.js`: 클라이언트 로직 (WebSocket, HTTP API)
- `server.js`: 간단한 HTTP 서버
- `styles.css`: (index.html에 인라인으로 포함)

## 연결 정보

- **데모 사이트**: http://localhost:8080
- **API Gateway**: http://localhost:3000
- **WebSocket**: ws://localhost:3000/ws
- **Health Check**: http://localhost:3000/api/v1/health

## 문제 해결

### "채팅 데이터를 불러올 수 없습니다"
- `broad_chat.csv` 파일이 상위 디렉토리에 있는지 확인
- 경로: `../broad_chat.csv`

### "WebSocket 연결 실패"
- API Gateway가 실행 중인지 확인: `http://localhost:3000/api/v1/health`
- 자동으로 HTTP API로 폴백됨

### "번역 실패"
- Python Worker가 실행 중인지 확인
- VLLM 서버가 정상인지 확인: `http://192.168.190.143:8000/v1/models`
- Redis가 실행 중인지 확인

## 개발자 도구

브라우저 개발자 도구 콘솔에서 상세 로그 확인:
```javascript
// WebSocket 메시지
// HTTP 요청/응답
// 번역 결과
```
