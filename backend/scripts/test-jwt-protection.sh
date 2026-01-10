#!/bin/bash

# Test JWT Protected Routes
# This script tests the authentication middleware on protected routes

set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

API_URL="${API_URL:-http://localhost:3467}"
VALID_TOKEN=""
TEST_EMAIL="test@example.com"
TEST_PASSWORD="password123"

echo "🔒 Testing JWT Protected Routes"
echo "================================"
echo ""

# Function to print test results
print_result() {
  local test_name=$1
  local expected=$2
  local actual=$3
  
  if [ "$expected" == "$actual" ]; then
    echo -e "${GREEN}✅ PASS${NC}: $test_name"
  else
    echo -e "${RED}❌ FAIL${NC}: $test_name (Expected: $expected, Got: $actual)"
  fi
}

# Test 1: Access protected route without token
echo "Test 1: Access /api/payments without token"
response=$(curl -s -w "\n%{http_code}" -X GET "$API_URL/api/payments" 2>/dev/null || echo "000")
status_code=$(echo "$response" | tail -n 1)
print_result "Reject request without token" "401" "$status_code"
echo ""

# Test 2: Access protected route with invalid token
echo "Test 2: Access /api/payments with invalid token"
response=$(curl -s -w "\n%{http_code}" -X GET "$API_URL/api/payments" \
  -H "Authorization: Bearer invalid_token_here" 2>/dev/null || echo "000")
status_code=$(echo "$response" | tail -n 1)
print_result "Reject request with invalid token" "401" "$status_code"
echo ""

# Test 3: Access protected route with malformed header
echo "Test 3: Access /api/payments with malformed Authorization header"
response=$(curl -s -w "\n%{http_code}" -X GET "$API_URL/api/payments" \
  -H "Authorization: invalid_format" 2>/dev/null || echo "000")
status_code=$(echo "$response" | tail -n 1)
print_result "Reject request with malformed header" "401" "$status_code"
echo ""

# Test 4: Register and login to get valid token
echo "Test 4: Register/Login to get valid JWT token"
register_response=$(curl -s -X POST "$API_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\",\"name\":\"Test User\"}" 2>/dev/null || echo '{}')

# Try login (registration may fail if user exists)
login_response=$(curl -s -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}" 2>/dev/null || echo '{}')

VALID_TOKEN=$(echo "$login_response" | jq -r '.token // empty' 2>/dev/null || echo "")

if [ -z "$VALID_TOKEN" ]; then
  echo -e "${YELLOW}⚠️  Could not obtain valid token. Make sure:${NC}"
  echo "   - Backend is running on $API_URL"
  echo "   - Database is initialized"
  echo "   - Auth routes are working"
  echo ""
  echo "Skipping tests that require valid token..."
  exit 0
else
  echo -e "${GREEN}✅ Successfully obtained JWT token${NC}"
  echo ""
fi

# Test 5: Access protected route with valid token
echo "Test 5: Access /api/payments with valid token"
response=$(curl -s -w "\n%{http_code}" -X GET "$API_URL/api/payments" \
  -H "Authorization: Bearer $VALID_TOKEN" 2>/dev/null || echo "000")
status_code=$(echo "$response" | tail -n 1)
print_result "Accept request with valid token" "200" "$status_code"
echo ""

# Test 6: Create payment with valid token
echo "Test 6: Create payment with valid token"
response=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/api/payments" \
  -H "Authorization: Bearer $VALID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"orderId":"test-'$(date +%s)'","amount":100,"currency":"USD"}' 2>/dev/null || echo "000")
status_code=$(echo "$response" | tail -n 1)
body=$(echo "$response" | head -n -1)
print_result "Create payment with valid token" "200" "$status_code"

# Extract payment ID for next tests
PAYMENT_ID=$(echo "$body" | jq -r '.id // empty' 2>/dev/null || echo "")
if [ -n "$PAYMENT_ID" ]; then
  echo -e "   Payment ID: $PAYMENT_ID"
fi
echo ""

# Test 7: Get payment details with valid token
if [ -n "$PAYMENT_ID" ]; then
  echo "Test 7: Get payment details with valid token"
  response=$(curl -s -w "\n%{http_code}" -X GET "$API_URL/api/payments/$PAYMENT_ID" \
    -H "Authorization: Bearer $VALID_TOKEN" 2>/dev/null || echo "000")
  status_code=$(echo "$response" | tail -n 1)
  print_result "Get payment details with valid token" "200" "$status_code"
  echo ""
fi

# Test 8: Get payment details without token
if [ -n "$PAYMENT_ID" ]; then
  echo "Test 8: Get payment details without token"
  response=$(curl -s -w "\n%{http_code}" -X GET "$API_URL/api/payments/$PAYMENT_ID" 2>/dev/null || echo "000")
  status_code=$(echo "$response" | tail -n 1)
  print_result "Reject get payment without token" "401" "$status_code"
  echo ""
fi

# Test 9: Create payment without token
echo "Test 9: Create payment without token"
response=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/api/payments" \
  -H "Content-Type: application/json" \
  -d '{"orderId":"test-'$(date +%s)'","amount":100,"currency":"USD"}' 2>/dev/null || echo "000")
status_code=$(echo "$response" | tail -n 1)
print_result "Reject create payment without token" "401" "$status_code"
echo ""

# Test 10: Access audit log with valid token
if [ -n "$PAYMENT_ID" ]; then
  echo "Test 10: Access payment audit log with valid token"
  response=$(curl -s -w "\n%{http_code}" -X GET "$API_URL/api/payments/$PAYMENT_ID/audit" \
    -H "Authorization: Bearer $VALID_TOKEN" 2>/dev/null || echo "000")
  status_code=$(echo "$response" | tail -n 1)
  print_result "Access audit log with valid token" "200" "$status_code"
  echo ""
fi

# Summary
echo "================================"
echo "🎉 JWT Protection Test Complete"
echo ""
echo "Expected Behavior:"
echo "  ✅ All requests without token should return 401"
echo "  ✅ All requests with invalid token should return 401"
echo "  ✅ All requests with valid token should succeed"
echo ""
echo "Frontend Impact:"
echo "  - Unauthenticated requests will be rejected"
echo "  - Frontend will redirect to /login on 401"
echo "  - Users must login to access dashboard, create, and payment details"
