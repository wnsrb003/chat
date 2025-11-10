#!/bin/bash

# Bull Queue의 쌓인 active jobs 정리 스크립트

QUEUE_NAME="translation-jobs"
REDIS_HOST="localhost"
REDIS_PORT="6379"

echo "🧹 Cleaning up stuck active jobs..."
echo "Queue: $QUEUE_NAME"
echo "Redis: $REDIS_HOST:$REDIS_PORT"
echo ""

# Active 리스트 크기 확인
ACTIVE_COUNT=$(redis-cli -h $REDIS_HOST -p $REDIS_PORT LLEN "bull:$QUEUE_NAME:active")
echo "📊 Current active jobs: $ACTIVE_COUNT"

if [ "$ACTIVE_COUNT" -eq 0 ]; then
    echo "✅ No active jobs to clean"
    exit 0
fi

# 정리 확인
read -p "⚠️  Delete all $ACTIVE_COUNT active jobs? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Cancelled"
    exit 1
fi

# Active 리스트 비우기
redis-cli -h $REDIS_HOST -p $REDIS_PORT DEL "bull:$QUEUE_NAME:active"

# 확인
NEW_COUNT=$(redis-cli -h $REDIS_HOST -p $REDIS_PORT LLEN "bull:$QUEUE_NAME:active")
echo "✅ Cleanup complete!"
echo "📊 Remaining active jobs: $NEW_COUNT"
