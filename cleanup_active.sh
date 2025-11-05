#!/bin/bash
# Active 상태에 갇힌 job들을 completed로 이동

echo "Cleaning up stuck active jobs..."

# Active에서 모든 job ID 가져오기
active_jobs=$(redis-cli LRANGE bull:translation-jobs:active 0 -1)

count=0
for job_id in $active_jobs; do
    # Active에서 제거
    redis-cli LREM bull:translation-jobs:active 0 "$job_id" > /dev/null

    # Completed로 이동
    timestamp=$(date +%s)000
    redis-cli ZADD bull:translation-jobs:completed "$timestamp" "$job_id" > /dev/null

    ((count++))
done

echo "Cleaned up $count jobs"
echo ""
echo "=== New Queue Status ==="
echo "Waiting: $(redis-cli LLEN bull:translation-jobs:wait)"
echo "Active: $(redis-cli LLEN bull:translation-jobs:active)"
echo "Completed: $(redis-cli ZCARD bull:translation-jobs:completed)"
