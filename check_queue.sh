#!/bin/bash
# Bull 큐 상태 확인

echo "=== Bull Queue Status ==="
echo ""

echo "Waiting jobs:"
redis-cli LLEN bull:translation-jobs:wait

echo ""
echo "Active jobs:"
redis-cli LLEN bull:translation-jobs:active

echo ""
echo "Completed jobs (recent):"
redis-cli ZCARD bull:translation-jobs:completed

echo ""
echo "Failed jobs:"
redis-cli ZCARD bull:translation-jobs:failed
