#!/bin/bash
# Detached Next.js dev launcher using double-fork via nohup+setsid
cd /home/z/my-project
rm -f /home/z/my-project/dev.log
# Use nohup + setsid + & + disown for maximum detachment
nohup setsid npx next dev -p 3000 > /home/z/my-project/dev.log 2>&1 < /dev/null &
PID=$!
echo "Started PID=$PID at $(date)"
# Save PID
echo $PID > /home/z/my-project/.next-dev.pid
# Wait briefly for it to be ready
sleep 1
exit 0
