#!/bin/bash

# Test script for rate limiting functionality
# This script tests that rate limiting works for authenticated users

echo "================================================"
echo "Testing Rate Limiting Implementation"
echo "================================================"
echo ""

# Configuration
BASE_URL="http://localhost:3467"
EMAIL="test@example.com"
PASSWORD="password123"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "Step 1: Register/Login to get JWT token..."
echo "-------------------------------------------"

# Try to login first
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")

# Extract token
TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*' | grep -o '[^"]*$')

if [ -z "$TOKEN" ]; then
  echo -e "${YELLOW}Login failed, user might not exist. Trying to register...${NC}"
  
  # Try to register
  REGISTER_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/register" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"name\":\"Test User\"}")
  
  TOKEN=$(echo $REGISTER_RESPONSE | grep -o '"token":"[^"]*' | grep -o '[^"]*$')
fi

if [ -z "$TOKEN" ]; then
  echo -e "${RED}Failed to get authentication token${NC}"
  echo "Response: $LOGIN_RESPONSE"
  exit 1
fi

echo -e "${GREEN}✓ Successfully authenticated${NC}"
echo "Token: ${TOKEN:0:20}..."
echo ""

echo "Step 2: Testing rate limit (5 requests per hour)..."
echo "---------------------------------------------------"

# Make 6 requests to trigger rate limit
for i in {1..6}; do
  echo "Request #$i:"
  
  RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X GET "$BASE_URL/api/payments" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json")
  
  HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
  BODY=$(echo "$RESPONSE" | grep -v "HTTP_CODE:")
  
  if [ "$HTTP_CODE" == "200" ]; then
    echo -e "  ${GREEN}✓ Status: $HTTP_CODE (Success)${NC}"
  elif [ "$HTTP_CODE" == "429" ]; then
    echo -e "  ${RED}✗ Status: $HTTP_CODE (Rate Limited)${NC}"
    echo "  Response: $BODY"
  else
    echo -e "  ${YELLOW}! Status: $HTTP_CODE${NC}"
    echo "  Response: $BODY"
  fi
  
  sleep 0.5
done

echo ""
echo "================================================"
echo "Rate Limit Test Complete!"
echo "================================================"
echo ""
echo "Expected behavior:"
echo "  - First 5 requests: HTTP 200 (Success)"
echo "  - 6th request: HTTP 429 (Too Many Requests)"
echo ""
echo "Note: Rate limit is per user (based on JWT user ID)"
echo "      and resets after 1 hour."
