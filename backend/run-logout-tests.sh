#!/bin/bash

echo "============================================================"
echo "🚀 Starting Logout & Token Expiry Tests"
echo "============================================================"
echo ""

# Check if backend is running
echo "🔍 Checking backend status..."
if curl -s http://127.0.0.1:3467/health > /dev/null 2>&1; then
    echo "✅ Backend is running"
else
    echo "❌ Backend is not running. Please start it first:"
    echo "   cd backend && node server.js"
    exit 1
fi

echo ""
echo "Running test suite..."
echo ""

# Run the test
cd /home/techmedaddy/projects/payeazie/backend
node test-logout-expiry.js

# Capture exit code
EXIT_CODE=$?

echo ""
if [ $EXIT_CODE -eq 0 ]; then
    echo "✅ All tests passed!"
else
    echo "❌ Some tests failed. See output above."
fi

exit $EXIT_CODE
