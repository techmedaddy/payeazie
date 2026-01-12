#!/bin/bash
# Verify Google OAuth Configuration

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Google OAuth Configuration Check"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

cd backend

# Check if .env file exists
if [ ! -f .env ]; then
  echo "❌ .env file not found"
  exit 1
fi

# Load .env
source .env

echo "📋 Current Configuration:"
echo ""
echo "Backend Port: $PORT"
echo "Frontend URL: $FRONTEND_URL"
echo "Google Callback URL: $GOOGLE_CALLBACK_URL"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Required Google Cloud Console Settings:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "✅ Authorised JavaScript origins:"
echo "   1. $FRONTEND_URL"
echo "   2. http://localhost:$PORT"
echo ""
echo "✅ Authorised redirect URIs:"
echo "   1. $GOOGLE_CALLBACK_URL"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🔗 Add this URL to Google Cloud Console:"
echo ""
echo "   $GOOGLE_CALLBACK_URL"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📝 Steps:"
echo "1. Go to: https://console.cloud.google.com/apis/credentials"
echo "2. Click on your OAuth 2.0 Client ID"
echo "3. Scroll to 'Authorised redirect URIs'"
echo "4. Click '+ Add URI'"
echo "5. Paste: $GOOGLE_CALLBACK_URL"
echo "6. Click 'SAVE'"
echo "7. Wait 1-2 minutes"
echo "8. Try OAuth again"
echo ""
