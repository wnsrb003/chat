# gRPC Proto 컴파일 가이드

## 🚀 빠른 시작

```bash
# 1. 패키지 설치 (이미 requirements.txt에 포함됨)
pip install grpcio grpcio-tools

# 2. Proto 컴파일 (스크립트 사용)
cd python-worker
./compile_proto.sh
```

## 📝 수동 컴파일 (선택사항)

```bash
cd python-worker/src/services/proto

python -m grpc_tools.protoc \
  -I. \
  --python_out=. \
  --grpc_python_out=. \
  translation.proto
```

## 📦 생성되는 파일

- `translation_pb2.py` - 메시지 정의
- `translation_pb2_grpc.py` - gRPC 서비스 정의

## ⚙️ 설정

`.env` 파일에서 gRPC 활성화:

```bash
USE_GRPC=true
CACHING_GRPC_URL=192.168.190.158:50051
```

## ⚡ 성능 비교

- **HTTP**: ~20-50ms 오버헤드
- **gRPC**: ~2-5ms 오버헤드 (**2-3배 빠름**)

## 🔧 Fallback

Proto 컴파일이 안 되어 있으면 **자동으로 HTTP로 fallback** 됩니다.

```
gRPC failed (gRPC proto files not available), falling back to HTTP
```
