#!/bin/bash
# 실시간 job 입력 속도 측정

echo "Measuring job input rate..."
echo "Press Ctrl+C to stop"
echo ""

prev_completed=$(redis-cli ZCARD bull:translation-jobs:completed)
prev_time=$(date +%s)

while true; do
    sleep 5

    curr_completed=$(redis-cli ZCARD bull:translation-jobs:completed)
    curr_time=$(date +%s)

    diff=$((curr_completed - prev_completed))
    time_diff=$((curr_time - prev_time))
    rate=$(echo "scale=2; $diff / $time_diff" | bc)

    echo "$(date '+%H:%M:%S') - Processed $diff jobs in ${time_diff}s = ${rate} jobs/sec"

    prev_completed=$curr_completed
    prev_time=$curr_time
done
