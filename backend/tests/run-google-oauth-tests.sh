#!/bin/bash
# Quick test runner for Google OAuth flow

echo "🚀 Google OAuth Test Suite"
echo "=========================="
echo ""

# Check if server is running
if ! lsof -Pi :3467 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "⚠️  Backend server is not running on port 3467"
    echo ""
    read -p "Start the server? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
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
        echo ""
    else
        echo "❌ Cannot run tests without backend server"
        exit 1
    fi
fi

echo "✅ Backend server is running"
echo ""

# Run tests
node tests/google-oauth-complete.test.js

EXIT_CODE=$?

echo ""
if [ $EXIT_CODE -eq 0 ]; then
    echo "✅ All tests passed!"
else
    echo "❌ Some tests failed (exit code: $EXIT_CODE)"
fi

exit $EXIT_CODE
