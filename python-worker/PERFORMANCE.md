# 🚀 성능 최적화 가이드

## Worker 병렬 처리

Python Worker는 기본적으로 **4개의 동시 작업**을 병렬로 처리합니다.

### 설정 방법

`.env` 파일에서 `WORKER_CONCURRENCY` 값을 조정하세요:

```bash
# 동시에 처리할 작업 수
WORKER_CONCURRENCY=4  # 기본값

# 높은 처리량이 필요한 경우
WORKER_CONCURRENCY=10

# 낮은 리소스 환경
WORKER_CONCURRENCY=2
```

### 성능 비교

#### 병렬 처리 없음 (이전)
```
채팅1 (200ms) → 처리 (0-200ms)
채팅2 (10ms)  → 대기 (200ms) → 처리 (200-210ms)
채팅3 (10ms)  → 대기 (210ms) → 처리 (210-220ms)
채팅4 (10ms)  → 대기 (220ms) → 처리 (220-230ms)
```
**결과**: 10개 채팅 = 약 300ms

#### 병렬 처리 4개 (현재)
```
Worker-1: 채팅1 (200ms) → 처리 (0-200ms)
Worker-2: 채팅2 (10ms)  → 처리 (0-10ms)
Worker-3: 채팅3 (10ms)  → 처리 (0-10ms)
Worker-4: 채팅4 (10ms)  → 처리 (0-10ms)
Worker-2: 채팅5 (10ms)  → 처리 (10-20ms)
...
```
**결과**: 10개 채팅 = 약 200ms (캐시 히트 시 더 빠름)

### 처리량

| Concurrency | 평균 처리 시간 | 초당 처리량 (예상) |
|------------|--------------|------------------|
| 1          | 200ms        | ~5개/초          |
| 2          | 200ms        | ~10개/초         |
| 4          | 200ms        | ~20개/초         |
| 8          | 200ms        | ~40개/초         |
| 10         | 200ms        | ~50개/초         |

**캐시 히트 시 (10ms):**
- Concurrency 4: **~400개/초**
- Concurrency 10: **~1000개/초**

### 권장 설정

#### 일반적인 경우
```bash
WORKER_CONCURRENCY=4  # CPU 코어 수와 비슷하게
```

#### 실시간 스트리밍 (고처리량)
```bash
WORKER_CONCURRENCY=10  # 더 높게
```

#### 개발/테스트 환경
```bash
WORKER_CONCURRENCY=2  # 낮게
```

### 모니터링

Worker 시작 시 로그에서 확인:
```
Starting Bull-compatible worker...
Concurrency: 4 workers
Worker-1 started
Worker-2 started
Worker-3 started
Worker-4 started
```

작업 처리 로그:
```
[Worker-1] Received job: abc123
[Worker-2] Received job: def456  ← 동시 처리!
[Worker-3] Received job: ghi789
```

### 주의사항

1. **너무 높은 값 설정 시**
   - 메모리 사용량 증가
   - Redis 연결 수 증가
   - 시스템 리소스 고갈 가능

2. **권장 최대값**
   - CPU 코어 수 × 2-3 정도
   - 예: 4코어 CPU = WORKER_CONCURRENCY=8~12

3. **병목이 외부 API에 있는 경우**
   - VLLM/Ollama 서버가 느리면 concurrency를 높여도 효과 제한적
   - Cache Service 사용 시 효과 극대화

## 추가 최적화 팁

### 1. Redis 연결 풀 크기
현재는 각 worker가 독립적으로 Redis 연결을 사용합니다. 필요시 연결 풀을 조정하세요.

### 2. Translation Service 선택
```bash
# 빠른 응답이 필요한 경우 (권장)
USE_OLLAMA=false  # Cache Service 사용

# 높은 품질이 필요한 경우
USE_OLLAMA=true   # Ollama 사용
```

### 3. 큐 타임아웃 조정
API Gateway의 큐 타임아웃도 함께 조정하세요:
```typescript
// api-gateway/src/config/index.ts
queue: {
  timeout: 30000,  // 30초
}
```

## 성능 테스트

### 부하 테스트 예제
```bash
# 100개 요청 동시 전송
for i in {1..100}; do
  curl -X POST http://localhost:3000/api/v1/translate \
    -H "Content-Type: application/json" \
    -d '{"text":"테스트","targetLanguages":["en"]}' &
done
wait
```

### 모니터링
```bash
# Redis 큐 상태 확인
redis-cli LLEN bull:translation-jobs:wait
redis-cli LLEN bull:translation-jobs:active

# Worker 로그 확인
tail -f python-worker/logs/worker.log
```
