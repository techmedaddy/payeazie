#!/bin/bash
# Script to start backend server and run Google OAuth tests

set -e

cd /home/techmedaddy/projects/payeazie/backend

echo "🔄 Checking if server is already running..."
if lsof -Pi :3467 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo "✅ Server already running on port 3467"
else
    echo "🚀 Starting backend server..."
    node server.js > /tmp/payeazie-backend.log 2>&1 &
    SERVER_PID=$!
    echo "   Server PID: $SERVER_PID"
    
    echo "⏳ Waiting for server to start..."
    for i in {1..10}; do
        sleep 1
        if curl -s http://127.0.0.1:3467/health > /dev/null 2>&1; then
            echo "✅ Server is ready!"
            break
        fi
        if [ $i -eq 10 ]; then
            echo "❌ Server failed to start within 10 seconds"
            echo "Last 20 lines of log:"
            tail -20 /tmp/payeazie-backend.log
            exit 1
        fi
    done
fi

echo ""
echo "=========================================="
echo "Running Google OAuth Phase 1 Test"
echo "=========================================="
node tests/google-oauth.phase1.test.js
