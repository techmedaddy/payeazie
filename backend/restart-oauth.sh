#!/bin/bash

echo "🔄 Restarting Payeazie Backend with OAuth Fixes"
echo "================================================"
echo ""

# Find the backend directory
BACKEND_DIR="/home/techmedaddy/projects/payeazie/backend"

# Check if we're in Docker
if docker ps | grep -q payeazie; then
  echo "📦 Detected Docker setup"
  echo "Restarting Docker container..."
  cd /home/techmedaddy/projects/payeazie
  docker-compose restart backend
  echo "✅ Docker container restarted"
  
elif systemctl list-units | grep -q payeazie; then
  echo "🔧 Detected systemd service"
  echo "Restarting systemd service..."
  sudo systemctl restart payeazie-backend
  echo "✅ Service restarted"
  
else
  echo "🔄 Manual restart"
  
  # Kill existing processes
  echo "Stopping existing backend processes..."
  pkill -f "node.*server.js" 2>/dev/null
  sleep 2
  
  # Start backend
  echo "Starting backend from: $BACKEND_DIR"
  cd "$BACKEND_DIR"
  
  # Start in background with logging
  nohup node server.js > server.log 2>&1 &
  SERVER_PID=$!
  
  echo "✅ Backend started (PID: $SERVER_PID)"
  echo "📝 Logs: $BACKEND_DIR/server.log"
fi

# Wait for startup
echo ""
echo "⏳ Waiting for backend to start..."
sleep 5

# Test health endpoint
echo ""
echo "🔍 Testing backend health..."
HEALTH=$(curl -s http://127.0.0.1:3467/health 2>&1)

if [ $? -eq 0 ]; then
  echo "✅ Backend is running!"
  echo "$HEALTH" | head -5
else
  echo "⚠️  Backend health check failed"
  echo "Check logs: tail -f $BACKEND_DIR/server.log"
fi

# Test OAuth endpoint
echo ""
echo "🔍 Testing Google OAuth endpoint..."
OAUTH_TEST=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3467/api/auth/google 2>&1)

if [ "$OAUTH_TEST" = "302" ]; then
  echo "✅ OAuth endpoint working! (HTTP 302 redirect)"
  echo "   Google OAuth is ready to use"
elif [ "$OAUTH_TEST" = "503" ]; then
  echo "⚠️  OAuth not configured (HTTP 503)"
  echo "   Check GOOGLE_CLIENT_SECRET in .env"
elif [ "$OAUTH_TEST" = "500" ]; then
  echo "❌ OAuth error (HTTP 500)"
  echo "   Check logs: tail -f $BACKEND_DIR/server.log"
else
  echo "⚠️  Unexpected response: HTTP $OAUTH_TEST"
fi

echo ""
echo "================================================"
echo "🎉 Restart complete!"
echo ""
echo "📍 Backend: http://localhost:3467"
echo "📍 Frontend: http://localhost:3000"
echo "📍 OAuth: http://localhost:3467/api/auth/google"
echo ""
echo "Next: Test in browser at http://localhost:3000"
