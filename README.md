# Chat Translation Service

실시간 채팅 번역을 위한 고성능 전처리 및 번역 시스템

## 📝 최근 업데이트 요약

### 2025.10.24
1. 전처리 시스템 대폭 강화: 축약어/신조어 사전 3배 확장(60→125개), PyKoSpacing 통합으로 띄어쓰기 82.3% 개선, 처리 속도 +6ms만 증가
2. 데모 사이트 UX 개선: 단일 언어 선택 방식으로 변경, 원본/전처리/번역 3단계 실시간 표시, Ghibli 스타일 유지
3. 성능 측정 시스템 구축: 전처리(~7ms) / 언어감지(~15ms) / 번역(~850ms) 단계별 시간 측정 및 로깅

### 2025.10.23
1. 전체 시스템 아키텍처 구축: Node.js API Gateway + Python Worker + Bull Queue 연동, VLLM 번역 파이프라인 완성
2. 한국어 채팅 전처리 시스템: Regex 기반 패턴 매칭(~1ms)으로 반복 문자 정규화, 축약어 확장(15개), 신조어 변환(5개) 등 7가지 전처리 기능 - LLM 대비 100배 빠른 속도
3. 96K 채팅 데모 사이트 구축: Ghibli 스타일 UI, 4개 언어 실시간 번역 시뮬레이션, 개별 언어별 HTTP 요청으로 즉시 표시

## 아키텍처

```
[Clients] → [Node.js API Gateway] → [Redis Queue] → [Python Workers] → [VLLM]
```

- **API Gateway (Node.js)**: HTTP/gRPC/WebSocket 요청 처리
- **Python Workers**: 텍스트 전처리 및 VLLM 번역 요청
- **Redis**: 작업 큐잉 및 결과 캐싱
- **VLLM**: LLM 번역 엔진

## 프로젝트 구조

```
chat-translation-service/
├── api-gateway/           # Node.js API 서버
│   ├── src/
│   │   ├── routes/       # HTTP/WebSocket 라우트
│   │   ├── middleware/   # 미들웨어
│   │   └── services/     # 비즈니스 로직
│   └── config/           # 설정 파일
├── python-worker/        # Python 전처리 워커
│   ├── src/
│   │   ├── preprocessor/ # 텍스트 전처리 로직
│   │   ├── models/       # 데이터 모델
│   │   └── services/     # VLLM 연동
│   ├── config/           # 설정 파일
│   └── tests/            # 테스트
└── shared/               # 공통 리소스
    ├── proto/            # gRPC 정의
    └── types/            # 공통 타입 정의

```

## 전처리 기능

### 필수 전처리
1. 언어 감지
2. HTML 태그 제거
3. 불필요한 번역 요청 필터링
4. 반복 문자열 정규화 (ㅋㅋㅋ → ㅋㅋ)
5. 이모티콘 문자열 처리 (/웃음/)
6. 특수 패턴 제거 (닉네임 태그, 길드 태그)

### 선택적 전처리 (옵션)
7. 자음 축약어 확장 (ㅊㄱㅇ → 축하해요)
8. 신조어/게임 용어 정규화
9. 욕설/비속어 필터링
10. 문장 구조 개선

## 시작하기

### 필요 사항
- Node.js 18+
- Python 3.10+
- Redis 7+
- Docker & Docker Compose (선택)

### 설치 및 실행
```bash
# Docker Compose로 실행
docker-compose up -d

# 또는 개별 실행
# API Gateway
cd api-gateway
npm install
npm run dev

# Python Worker
cd python-worker
pip install -r requirements.txt
python src/worker.py
```

## API 엔드포인트

### HTTP
```
POST /api/v1/translate
Body: {
  "text": "ㅋㅋㅋㅋ 이거 ㄹㅈㄷ",
  "targetLanguages": ["en", "ja"],
  "options": {
    "expandAbbreviations": true,
    "filterProfanity": true
  }
}
```

### WebSocket
```
ws://localhost:3000/ws
Message: { "text": "...", "targetLanguages": [...] }
```

### gRPC
```
service TranslationService {
  rpc Translate(TranslateRequest) returns (TranslateResponse);
}
```
