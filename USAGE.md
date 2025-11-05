# 사용 가이드

## 빠른 시작

### 1. Docker Compose로 실행 (권장)

```bash
# 프로젝트 루트에서
cd chat-translation-service

# 환경변수 설정
cp api-gateway/.env.example api-gateway/.env
cp python-worker/.env.example python-worker/.env

# 서비스 실행
docker-compose up -d

# 로그 확인
docker-compose logs -f
```

### 2. 개별 실행

#### Redis 실행
```bash
# Docker로 Redis 실행
docker run -d -p 6379:6379 redis:7-alpine
```

#### API Gateway 실행
```bash
cd api-gateway
npm install
cp .env.example .env
npm run dev
```

#### Python Worker 실행
```bash
cd python-worker
pip install -r requirements.txt
cp .env.example .env
python -m src.worker
```

## API 사용 예시

### HTTP API

#### 1. 동기 번역 (결과를 즉시 반환)
```bash
curl -X POST http://localhost:3000/api/v1/translate \
  -H "Content-Type: application/json" \
  -d '{
    "text": "ㅋㅋㅋㅋ 이거 ㄹㅈㄷ인데?? [C9]파파(2)",
    "targetLanguages": ["en", "ja"],
    "options": {
      "expandAbbreviations": true,
      "filterProfanity": false,
      "normalizeRepeats": true,
      "removeEmoticons": true,
      "fixTypos": false
    }
  }'
```

**응답:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "originalText": "ㅋㅋㅋㅋ 이거 ㄹㅈㄷ인데?? [C9]파파(2)",
    "preprocessedText": "ㅋㅋ 이거 레전드인데??",
    "translations": {
      "en": "LOL this is legendary??",
      "ja": "笑笑 これレジェンドだろ??"
    },
    "detectedLanguage": "ko",
    "processingTime": 1.23,
    "filtered": false
  }
}
```

#### 2. 비동기 번역 (즉시 JobID 반환)
```bash
curl -X POST http://localhost:3000/api/v1/translate \
  -H "Content-Type: application/json" \
  -d '{
    "text": "겜시작 전까지 한판 가능해",
    "targetLanguages": ["en"],
    "async": true
  }'
```

**응답:**
```json
{
  "success": true,
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Translation job queued"
}
```

#### 3. 작업 상태 조회
```bash
curl http://localhost:3000/api/v1/jobs/550e8400-e29b-41d4-a716-446655440000
```

**응답 (완료):**
```json
{
  "success": true,
  "status": "completed",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "originalText": "겜시작 전까지 한판 가능해",
    "preprocessedText": "겜시작 전까지 한판 가능해",
    "translations": {
      "en": "Can play one round before the game starts"
    },
    "detectedLanguage": "ko",
    "processingTime": 0.95,
    "filtered": false
  }
}
```

#### 4. 헬스 체크
```bash
curl http://localhost:3000/api/v1/health
```

**응답:**
```json
{
  "success": true,
  "status": "healthy",
  "queue": {
    "waiting": 0,
    "active": 2,
    "completed": 150,
    "failed": 1,
    "delayed": 0,
    "total": 153
  },
  "timestamp": 1729675432000
}
```

### WebSocket API

#### JavaScript/Node.js 예시
```javascript
const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:3000/ws');

ws.on('open', () => {
  console.log('Connected');

  // 번역 요청
  ws.send(JSON.stringify({
    type: 'translate',
    text: 'ㅋㅋㅋ 쳐웃네',
    targetLanguages: ['en', 'ja'],
    options: {
      expandAbbreviations: true,
      normalizeRepeats: true
    }
  }));
});

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());

  switch (message.type) {
    case 'connected':
      console.log('Client ID:', message.clientId);
      break;

    case 'queued':
      console.log('Job queued:', message.jobId);
      break;

    case 'result':
      console.log('Translation result:', message.data);
      break;

    case 'error':
      console.error('Error:', message.error);
      break;
  }
});

// Ping/Pong
setInterval(() => {
  ws.send(JSON.stringify({ type: 'ping' }));
}, 30000);
```

#### Python 예시
```python
import asyncio
import websockets
import json

async def translate():
    uri = "ws://localhost:3000/ws"

    async with websockets.connect(uri) as websocket:
        # 번역 요청
        await websocket.send(json.dumps({
            "type": "translate",
            "text": "ㅋㅋㅋㅋ 이거 ㄹㅈㄷ",
            "targetLanguages": ["en"],
        }))

        # 응답 수신
        while True:
            message = await websocket.recv()
            data = json.loads(message)

            if data["type"] == "result":
                print("Translation:", data["data"])
                break
            elif data["type"] == "error":
                print("Error:", data["error"])
                break

asyncio.run(translate())
```

## 전처리 옵션 설명

| 옵션 | 기본값 | 설명 |
|------|--------|------|
| `expandAbbreviations` | `true` | 자음 축약어 확장 (ㅊㄱㅇ → 축하해요) |
| `filterProfanity` | `false` | 욕설 필터링 (*** 처리) |
| `normalizeRepeats` | `true` | 반복 문자 정규화 (ㅋㅋㅋ → ㅋㅋ) |
| `removeEmoticons` | `true` | 이모티콘 제거 (/웃음/) |
| `fixTypos` | `false` | 오타 교정 (미구현) |

## 실제 채팅 데이터 테스트

```bash
# broad_chat.csv에서 샘플 추출하여 테스트
cd python-worker

# 테스트 실행
pytest tests/test_preprocessor.py -v

# 커버리지 확인
pytest tests/ --cov=src --cov-report=html
```

## 성능 튜닝

### Worker 수 조정
```yaml
# docker-compose.yml
python-worker:
  deploy:
    replicas: 4  # 워커 수 증가
```

### Redis 최적화
```yaml
redis:
  command: redis-server --appendonly yes --maxmemory 2gb --maxmemory-policy allkeys-lru
```

### API Gateway 동시성
```bash
# .env
QUEUE_MAX_JOBS=5000
RATE_LIMIT_MAX_REQUESTS=1000
```

## 모니터링

### Queue 상태 확인
```bash
curl http://localhost:3000/api/v1/health | jq
```

### Redis 모니터링
```bash
docker exec -it chat-translation-service_redis_1 redis-cli
> INFO stats
> LLEN translation-jobs
```

### 로그 확인
```bash
# API Gateway 로그
docker-compose logs -f api-gateway

# Python Worker 로그
docker-compose logs -f python-worker
```

## 문제 해결

### VLLM 연결 실패
```bash
# VLLM 서버 상태 확인
curl http://192.168.190.143:8000/v1/models

# 네트워크 확인
ping 192.168.190.143
```

### Redis 연결 실패
```bash
# Redis 컨테이너 상태 확인
docker ps | grep redis

# Redis 연결 테스트
docker exec -it chat-translation-service_redis_1 redis-cli ping
```

### Worker가 작업을 처리하지 않음
```bash
# Worker 로그 확인
docker-compose logs python-worker

# Queue에 작업이 쌓여있는지 확인
docker exec -it chat-translation-service_redis_1 redis-cli
> LLEN translation-jobs
```
