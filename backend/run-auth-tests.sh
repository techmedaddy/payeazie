#!/bin/bash

echo "🧪 Payeazie Authentication Test Suite"
echo "======================================"
echo ""

# Check if backend is running
if ! curl -s http://127.0.0.1:3467/health > /dev/null 2>&1; then
  echo "⚠️  Backend not running on port 3467"
  echo "   Start backend first: cd backend && node server.js"
  echo ""
  read -p "Start backend now? (y/n) " -n 1 -r
  echo ""
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Starting backend..."
    cd /home/techmedaddy/projects/payeazie/backend
    node server.js &
    BACKEND_PID=$!
    echo "Backend started (PID: $BACKEND_PID)"
    echo "Waiting for startup..."
    sleep 5
  else
    echo "❌ Tests require running backend. Exiting."
    exit 1
  fi
fi

echo "✅ Backend is running"
echo ""

# Check dependencies
if ! command -v node &> /dev/null; then
  echo "❌ Node.js not found"
  exit 1
fi

cd /home/techmedaddy/projects/payeazie/backend

# Check if tap is installed
if ! npm list tap > /dev/null 2>&1; then
  echo "⚠️  tap not installed"
  echo "Installing dependencies..."
  npm install --save-dev tap
fi

echo "Running test suite..."
echo ""

# Run the test runner
node run-auth-tests.js

EXIT_CODE=$?

# Cleanup if we started the backend
if [ ! -z "$BACKEND_PID" ]; then
  echo ""
  echo "Stopping backend (PID: $BACKEND_PID)..."
  kill $BACKEND_PID 2>/dev/null
fi

exit $EXIT_CODE
