# Bull 큐 + Python Worker 가이드

## 🎯 개요

Node.js API Gateway는 **Bull 큐**를 사용하고, Python Worker는 **Bull 큐를 직접 읽어서** 처리합니다.

이 방식은 RQ를 사용하는 것보다 **성능이 빠르고** Bull의 강력한 기능(재시도, 우선순위, 지연 등)을 활용할 수 있습니다.

## 📁 파일 구조

```
python-worker/
├── src/
│   ├── worker.py          # 기존 RQ Worker (사용 안 함)
│   └── bull_worker.py     # ✅ 새로운 Bull 호환 Worker
```

## 🔧 작동 방식

### Bull이 Redis에 저장하는 구조:

```
bull:{queue_name}:wait       → 대기 중인 작업 ID 리스트
bull:{queue_name}:active     → 처리 중인 작업 ID 리스트
bull:{queue_name}:completed  → 완료된 작업 ID (Sorted Set)
bull:{queue_name}:failed     → 실패한 작업 ID (Sorted Set)
bull:{queue_name}:{job_id}   → 작업 데이터 (Hash)
```

### Python Worker 처리 과정:

1. **작업 가져오기**: `BRPOPLPUSH`로 `wait`에서 `active`로 이동
2. **데이터 읽기**: Hash에서 작업 데이터(JSON) 읽기
3. **전처리 + 번역**: 기존 로직 그대로 사용
4. **결과 저장**: Hash에 `returnvalue` 저장
5. **완료 처리**: `active`에서 제거, `completed`에 추가
6. **이벤트 발행**: `bull:{queue_name}:completed` 채널에 publish

## 🚀 실행 방법

### 1. Redis 시작
```bash
docker run -d --name translation-redis -p 6379:6379 redis:7-alpine
```

### 2. API Gateway 시작
```bash
cd /Users/gyu/Develop/test-api/chat-translation-service/api-gateway
npm run dev
```

### 3. Python Bull Worker 시작 ⭐
```bash
cd /Users/gyu/Develop/test-api/chat-translation-service/python-worker
source venv/bin/activate
python -m src.bull_worker  # ← 이것 사용!
```

### 4. 데모 사이트 시작
```bash
cd /Users/gyu/Develop/test-api/demo-site
node server.js
```

## ✅ 테스트

### HTTP API
```bash
curl -X POST http://localhost:3000/api/v1/translate \
  -H "Content-Type: application/json" \
  -d '{
    "text": "ㅋㅋㅋㅋ 이거 ㄹㅈㄷ [C9]파파(2)",
    "targetLanguages": ["en", "ja"]
  }'
```

### 데모 사이트
http://localhost:8080

## 📊 성능 이점

### Bull 큐 사용 시:
- ✅ **재시도 메커니즘**: 실패 시 자동 재시도
- ✅ **작업 우선순위**: 중요한 작업 먼저 처리
- ✅ **지연 작업**: 나중에 실행할 작업 예약
- ✅ **속도 제한**: Rate limiting 지원
- ✅ **진행 상황**: 작업 진행률 추적
- ✅ **이벤트**: 완료/실패 등 이벤트 리스닝

### vs RQ:
- Bull은 Node.js 생태계와 완벽히 통합
- Python Worker가 Bull 형식을 읽는 것이 RQ보다 간단
- Bull의 UI 도구들 활용 가능 (Bull Board 등)

## 🔍 디버깅

### Redis에서 직접 확인
```bash
docker exec -it translation-redis redis-cli

# 대기 중인 작업 수
LLEN bull:translation-jobs:wait

# 활성 작업 수
LLEN bull:translation-jobs:active

# 완료된 작업 수
ZCARD bull:translation-jobs:completed

# 특정 작업 데이터 보기
HGETALL bull:translation-jobs:{job-id}
```

### 로그 확인
```bash
# API Gateway
tail -f /tmp/api-gateway.log

# Python Worker
python -m src.bull_worker  # 직접 터미널에서 실행하면 로그 실시간 확인
```

## 🎨 전처리 옵션

Python Worker는 다음 전처리를 수행합니다:

1. **언어 감지** (langdetect)
2. **HTML 태그 제거**
3. **불필요한 텍스트 필터링**
4. **반복 문자 정규화** (ㅋㅋㅋ → ㅋㅋ)
5. **이모티콘 제거** (/웃음/)
6. **특수 패턴 제거** ([C9], (2) 등)
7. **자음 축약어 확장** (ㅊㄱㅇ → 축하해요)
8. **신조어 정규화** (ㄹㅈㄷ → 레전드)
9. **욕설 필터링** (선택)

## 🔥 핵심 코드

`bull_worker.py`의 핵심 부분:

```python
# 1. 작업 가져오기 (블로킹)
job_id = redis_conn.brpoplpush(
    "bull:translation-jobs:wait",
    "bull:translation-jobs:active",
    timeout=5
)

# 2. 데이터 읽기
job_data = json.loads(
    redis_conn.hget(f"bull:translation-jobs:{job_id}", "data")
)

# 3. 처리
result = await process_bull_job(job_id, job_data)

# 4. 결과 저장
redis_conn.hset(
    f"bull:translation-jobs:{job_id}",
    "returnvalue",
    json.dumps(result)
)

# 5. 완료 처리
redis_conn.zadd(
    "bull:translation-jobs:completed",
    {job_id: time.time() * 1000}
)

# 6. 이벤트 발행
redis_conn.publish(
    "bull:translation-jobs:completed",
    json.dumps({"jobId": job_id})
)
```

## 🎯 다음 단계

이제 모든 것이 준비되었습니다! 직접 실행해보세요:

```bash
# Terminal 1: Redis
docker run -d --name translation-redis -p 6379:6379 redis:7-alpine

# Terminal 2: API Gateway
cd api-gateway && npm run dev

# Terminal 3: Python Bull Worker
cd python-worker && source venv/bin/activate && python -m src.bull_worker

# Terminal 4: Demo Site
cd demo-site && node server.js

# 브라우저: http://localhost:8080
```

즐거운 번역되세요! 🎉
