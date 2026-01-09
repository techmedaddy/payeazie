#!/bin/bash

# Test Authentication Endpoints
# Make sure the backend server is running before executing this script

API_URL="http://localhost:3467/api/auth"
TEST_EMAIL="test-$(date +%s)@example.com"
TEST_PASSWORD="securepassword123"
TEST_NAME="Test User"

echo "🧪 Testing Authentication Endpoints"
echo "===================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Register
echo "1️⃣  Testing Registration..."
REGISTER_RESPONSE=$(curl -s -X POST "$API_URL/register" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$TEST_EMAIL\",
    \"password\": \"$TEST_PASSWORD\",
    \"name\": \"$TEST_NAME\"
  }")

echo "$REGISTER_RESPONSE" | jq . 2>/dev/null

if echo "$REGISTER_RESPONSE" | grep -q "\"success\":true"; then
  echo -e "${GREEN}✓ Registration successful${NC}"
  TOKEN=$(echo "$REGISTER_RESPONSE" | jq -r '.data.token')
  echo "   Token: ${TOKEN:0:50}..."
else
  echo -e "${RED}✗ Registration failed${NC}"
  exit 1
fi

echo ""

# Test 2: Login
echo "2️⃣  Testing Login..."
LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/login" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$TEST_EMAIL\",
    \"password\": \"$TEST_PASSWORD\"
  }")

echo "$LOGIN_RESPONSE" | jq . 2>/dev/null

if echo "$LOGIN_RESPONSE" | grep -q "\"success\":true"; then
  echo -e "${GREEN}✓ Login successful${NC}"
  TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.data.token')
else
  echo -e "${RED}✗ Login failed${NC}"
  exit 1
fi

echo ""

# Test 3: Get Current User
echo "3️⃣  Testing Get Current User..."
ME_RESPONSE=$(curl -s -X GET "$API_URL/me" \
  -H "Authorization: Bearer $TOKEN")

echo "$ME_RESPONSE" | jq . 2>/dev/null

if echo "$ME_RESPONSE" | grep -q "\"success\":true"; then
  echo -e "${GREEN}✓ Get user info successful${NC}"
else
  echo -e "${RED}✗ Get user info failed${NC}"
  exit 1
fi

echo ""

# Test 4: Invalid Login
echo "4️⃣  Testing Invalid Login..."
INVALID_LOGIN=$(curl -s -X POST "$API_URL/login" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$TEST_EMAIL\",
    \"password\": \"wrongpassword\"
  }")

if echo "$INVALID_LOGIN" | grep -q "Invalid credentials"; then
  echo -e "${GREEN}✓ Invalid login correctly rejected${NC}"
else
  echo -e "${RED}✗ Invalid login test failed${NC}"
fi

echo ""

# Test 5: Duplicate Email
echo "5️⃣  Testing Duplicate Email..."
DUPLICATE_RESPONSE=$(curl -s -X POST "$API_URL/register" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$TEST_EMAIL\",
    \"password\": \"$TEST_PASSWORD\",
    \"name\": \"Another User\"
  }")

if echo "$DUPLICATE_RESPONSE" | grep -q "Email already exists"; then
  echo -e "${GREEN}✓ Duplicate email correctly rejected${NC}"
else
  echo -e "${RED}✗ Duplicate email test failed${NC}"
fi

echo ""

# Test 6: Invalid Token
echo "6️⃣  Testing Invalid Token..."
INVALID_TOKEN_RESPONSE=$(curl -s -X GET "$API_URL/me" \
  -H "Authorization: Bearer invalid-token-here")

if echo "$INVALID_TOKEN_RESPONSE" | grep -q "Invalid token\|Unauthorized"; then
  echo -e "${GREEN}✓ Invalid token correctly rejected${NC}"
else
  echo -e "${RED}✗ Invalid token test failed${NC}"
fi

echo ""
echo "===================================="
echo -e "${GREEN}✅ All authentication tests completed!${NC}"
echo ""
echo "Test user created:"
echo "  Email: $TEST_EMAIL"
echo "  Password: $TEST_PASSWORD"
echo "  Token: ${TOKEN:0:50}..."
echo ""
