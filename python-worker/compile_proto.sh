#!/bin/bash
# Proto 파일 컴파일 스크립트

echo "🔨 Compiling gRPC proto files..."

cd "$(dirname "$0")/proto" || exit

# 기존 파일 삭제 (버전 충돌 방지)
rm -f translation_pb2.py translation_pb2_grpc.py

python -m grpc_tools.protoc \
  -I. \
  --python_out=. \
  --grpc_python_out=. \
  translation.proto

if [ $? -eq 0 ]; then
    echo "✅ Proto compilation successful!"
    echo ""
    echo "Generated files:"
    ls -lh translation_pb2*.py 2>/dev/null || echo "⚠️  Files not found"
    echo ""
    echo "To use gRPC, set in .env:"
    echo "  USE_GRPC=true"
else
    echo "❌ Proto compilation failed!"
    echo ""
    echo "Make sure grpcio-tools is installed:"
    echo "  pip install grpcio grpcio-tools"
    exit 1
fi
