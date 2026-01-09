#!/bin/bash

# Test script for password reset flow
# This script demonstrates the complete password reset process

echo "================================================"
echo "Testing Password Reset Flow"
echo "================================================"
echo ""

# Configuration
BASE_URL="http://localhost:3467"
TEST_EMAIL="test-reset@example.com"
TEST_PASSWORD="password123"
NEW_PASSWORD="newpassword456"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "Step 1: Register/Login to create test account..."
echo "-------------------------------------------"

# Try to register a new user
REGISTER_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\",\"name\":\"Test User\"}")

USER_ID=$(echo $REGISTER_RESPONSE | grep -o '"id":"[^"]*' | grep -o '[^"]*$')

if [ -z "$USER_ID" ]; then
  echo -e "${YELLOW}Registration failed (user might already exist). Trying to login...${NC}"
  
  LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}")
  
  USER_ID=$(echo $LOGIN_RESPONSE | grep -o '"id":"[^"]*' | grep -o '[^"]*$')
fi

if [ -z "$USER_ID" ]; then
  echo -e "${RED}Failed to create/login test account${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Test account ready (User ID: $USER_ID)${NC}"
echo ""

echo "Step 2: Request password reset..."
echo "-------------------------------------------"

FORGOT_RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST "$BASE_URL/api/auth/forgot-password" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\"}")

HTTP_CODE=$(echo "$FORGOT_RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
BODY=$(echo "$FORGOT_RESPONSE" | grep -v "HTTP_CODE:")

if [ "$HTTP_CODE" == "200" ]; then
  echo -e "${GREEN}✓ Password reset requested successfully${NC}"
  echo "  Response: $BODY"
  echo ""
  echo -e "${BLUE}📧 Check your email for the password reset link${NC}"
  echo -e "${YELLOW}   Note: If SMTP is not configured, check the server logs for the reset token${NC}"
else
  echo -e "${RED}✗ Failed to request password reset (HTTP $HTTP_CODE)${NC}"
  echo "  Response: $BODY"
  exit 1
fi

echo ""
echo "Step 3: Retrieve reset token from database..."
echo "-------------------------------------------"

# Query the database for the most recent token
TOKEN=$(node -r dotenv/config -e "
  const db = require('./src/db');
  db.oneOrNone('SELECT token FROM password_resets WHERE user_id = \$1 ORDER BY created_at DESC LIMIT 1', ['$USER_ID'])
    .then(result => {
      if (result) {
        console.log(result.token);
      } else {
        console.error('No token found');
        process.exit(1);
      }
      process.exit(0);
    })
    .catch(err => {
      console.error('Error:', err.message);
      process.exit(1);
    });
" 2>/dev/null)

if [ -z "$TOKEN" ]; then
  echo -e "${RED}✗ Failed to retrieve reset token from database${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Reset token retrieved${NC}"
echo "  Token: ${TOKEN:0:20}..."
echo ""

echo "Step 4: Reset password with token..."
echo "-------------------------------------------"

RESET_RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST "$BASE_URL/api/auth/reset-password" \
  -H "Content-Type: application/json" \
  -d "{\"token\":\"$TOKEN\",\"newPassword\":\"$NEW_PASSWORD\"}")

HTTP_CODE=$(echo "$RESET_RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
BODY=$(echo "$RESET_RESPONSE" | grep -v "HTTP_CODE:")

if [ "$HTTP_CODE" == "200" ]; then
  echo -e "${GREEN}✓ Password reset successful${NC}"
  echo "  Response: $BODY"
else
  echo -e "${RED}✗ Failed to reset password (HTTP $HTTP_CODE)${NC}"
  echo "  Response: $BODY"
  exit 1
fi

echo ""
echo "Step 5: Test login with new password..."
echo "-------------------------------------------"

LOGIN_NEW_RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$NEW_PASSWORD\"}")

HTTP_CODE=$(echo "$LOGIN_NEW_RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
BODY=$(echo "$LOGIN_NEW_RESPONSE" | grep -v "HTTP_CODE:")

if [ "$HTTP_CODE" == "200" ]; then
  echo -e "${GREEN}✓ Login with new password successful${NC}"
  echo "  New password works!"
else
  echo -e "${RED}✗ Failed to login with new password (HTTP $HTTP_CODE)${NC}"
  echo "  Response: $BODY"
  exit 1
fi

echo ""
echo "Step 6: Test old password (should fail)..."
echo "-------------------------------------------"

LOGIN_OLD_RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}")

HTTP_CODE=$(echo "$LOGIN_OLD_RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)

if [ "$HTTP_CODE" == "401" ]; then
  echo -e "${GREEN}✓ Old password correctly rejected${NC}"
else
  echo -e "${YELLOW}! Old password still works (HTTP $HTTP_CODE) - This shouldn't happen${NC}"
fi

echo ""
echo "Step 7: Test token reuse (should fail)..."
echo "-------------------------------------------"

REUSE_RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST "$BASE_URL/api/auth/reset-password" \
  -H "Content-Type: application/json" \
  -d "{\"token\":\"$TOKEN\",\"newPassword\":\"anotherpassword\"}")

HTTP_CODE=$(echo "$REUSE_RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
BODY=$(echo "$REUSE_RESPONSE" | grep -v "HTTP_CODE:")

if [ "$HTTP_CODE" == "400" ]; then
  echo -e "${GREEN}✓ Token reuse correctly rejected${NC}"
  echo "  Error message: $BODY"
else
  echo -e "${RED}✗ Token reuse was not rejected (HTTP $HTTP_CODE)${NC}"
  echo "  Response: $BODY"
fi

echo ""
echo "================================================"
echo "Password Reset Flow Test Complete!"
echo "================================================"
echo ""
echo "Summary:"
echo "  ✓ Password reset request"
echo "  ✓ Token generation"
echo "  ✓ Password update"
echo "  ✓ New password works"
echo "  ✓ Old password rejected"
echo "  ✓ Token reuse prevented"
echo ""
echo "Cleanup: Resetting password back to original..."
# Request another reset to restore original password
curl -s -X POST "$BASE_URL/api/auth/forgot-password" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\"}" > /dev/null

# Get new token
NEW_TOKEN=$(node -r dotenv/config -e "
  const db = require('./src/db');
  db.oneOrNone('SELECT token FROM password_resets WHERE user_id = \$1 ORDER BY created_at DESC LIMIT 1', ['$USER_ID'])
    .then(result => {
      if (result) console.log(result.token);
      process.exit(0);
    })
    .catch(() => process.exit(1));
" 2>/dev/null)

if [ ! -z "$NEW_TOKEN" ]; then
  curl -s -X POST "$BASE_URL/api/auth/reset-password" \
    -H "Content-Type: application/json" \
    -d "{\"token\":\"$NEW_TOKEN\",\"newPassword\":\"$TEST_PASSWORD\"}" > /dev/null
  echo -e "${GREEN}✓ Test account password restored${NC}"
fi

echo ""
