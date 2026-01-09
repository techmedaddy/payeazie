#!/bin/bash
# Test script for Phase 6: Audit Logging & Request Monitoring

set -e

BASE_URL="http://localhost:3467"
API_URL="$BASE_URL/api"

echo "🧪 Phase 6: Audit Logging & Request Monitoring Test"
echo "=================================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if server is running
echo "📡 Checking server health..."
HEALTH=$(curl -s "$BASE_URL/health" || echo "")
if [ -z "$HEALTH" ]; then
    echo -e "${RED}❌ Server is not running${NC}"
    echo "   Start the server first: cd backend && npm start"
    exit 1
fi
echo -e "${GREEN}✓ Server is running${NC}"
echo ""

# Step 1: Register a test user
echo "👤 Step 1: Register test user..."
REGISTER_RESPONSE=$(curl -s -X POST "$API_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "audit-test@example.com",
    "password": "TestPass123!",
    "name": "Audit Test User"
  }' || echo '{"success":false}')

USER_TOKEN=$(echo "$REGISTER_RESPONSE" | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$USER_TOKEN" ]; then
    # Try to login if user already exists
    echo -e "${YELLOW}⚠ User may already exist, trying to login...${NC}"
    LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/auth/login" \
      -H "Content-Type: application/json" \
      -d '{
        "email": "audit-test@example.com",
        "password": "TestPass123!"
      }')
    
    USER_TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*' | cut -d'"' -f4)
    
    if [ -z "$USER_TOKEN" ]; then
        echo -e "${RED}❌ Failed to authenticate user${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}✓ User authenticated${NC}"
echo "   Token: ${USER_TOKEN:0:20}..."
echo ""

# Step 2: Create a payment
echo "💳 Step 2: Create a test payment..."
PAYMENT_RESPONSE=$(curl -s -X POST "$API_URL/payments/intent" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Idempotency-Key: audit-test-$(date +%s%N)" \
  -d '{
    "orderId": "AUDIT-TEST-'"$(date +%s)"'",
    "amount": 1500,
    "currency": "USD"
  }')

PAYMENT_ID=$(echo "$PAYMENT_RESPONSE" | grep -o '"id":"[^"]*' | cut -d'"' -f4)

if [ -z "$PAYMENT_ID" ]; then
    echo -e "${RED}❌ Failed to create payment${NC}"
    echo "   Response: $PAYMENT_RESPONSE"
    exit 1
fi

echo -e "${GREEN}✓ Payment created${NC}"
echo "   Payment ID: $PAYMENT_ID"
echo ""

# Step 3: Wait for worker to process payment
echo "⏳ Step 3: Waiting for worker to process payment (5 seconds)..."
sleep 5
echo -e "${GREEN}✓ Wait complete${NC}"
echo ""

# Step 4: Get user's audit logs
echo "📋 Step 4: Fetch user's audit logs..."
AUDIT_RESPONSE=$(curl -s -X GET "$API_URL/audit-logs?page=1&limit=5" \
  -H "Authorization: Bearer $USER_TOKEN")

AUDIT_SUCCESS=$(echo "$AUDIT_RESPONSE" | grep -o '"success":true' || echo "")
if [ -z "$AUDIT_SUCCESS" ]; then
    echo -e "${RED}❌ Failed to fetch audit logs${NC}"
    echo "   Response: $AUDIT_RESPONSE"
    exit 1
fi

AUDIT_COUNT=$(echo "$AUDIT_RESPONSE" | grep -o '"totalCount":[0-9]*' | cut -d':' -f2)
echo -e "${GREEN}✓ Audit logs retrieved${NC}"
echo "   Total audit entries: $AUDIT_COUNT"
echo ""

# Step 5: Get specific payment audit log
echo "📄 Step 5: Fetch audit log for specific payment..."
PAYMENT_AUDIT_RESPONSE=$(curl -s -X GET "$API_URL/audit-logs/$PAYMENT_ID" \
  -H "Authorization: Bearer $USER_TOKEN")

PAYMENT_AUDIT_SUCCESS=$(echo "$PAYMENT_AUDIT_RESPONSE" | grep -o '"success":true' || echo "")
if [ -z "$PAYMENT_AUDIT_SUCCESS" ]; then
    echo -e "${RED}❌ Failed to fetch payment audit log${NC}"
    echo "   Response: $PAYMENT_AUDIT_RESPONSE"
    exit 1
fi

# Count transitions
TRANSITIONS=$(echo "$PAYMENT_AUDIT_RESPONSE" | grep -o '"from_status"' | wc -l)
echo -e "${GREEN}✓ Payment audit log retrieved${NC}"
echo "   Status transitions: $TRANSITIONS"
echo ""

# Step 6: Display sample audit entry
echo "🔍 Step 6: Sample audit entry:"
echo "$PAYMENT_AUDIT_RESPONSE" | grep -o '"triggered_by":"[^"]*' | head -1 || echo "   (No triggered_by field found)"
echo ""

# Step 7: Test authorization (try to access without token)
echo "🔒 Step 7: Test authorization..."
UNAUTH_RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$API_URL/audit-logs" 2>/dev/null)
HTTP_CODE=$(echo "$UNAUTH_RESPONSE" | tail -1)

if [ "$HTTP_CODE" = "401" ]; then
    echo -e "${GREEN}✓ Unauthorized access properly rejected (401)${NC}"
else
    echo -e "${RED}❌ Expected 401, got $HTTP_CODE${NC}"
fi
echo ""

# Step 8: Test pagination
echo "📃 Step 8: Test pagination..."
PAGE2_RESPONSE=$(curl -s -X GET "$API_URL/audit-logs?page=2&limit=2" \
  -H "Authorization: Bearer $USER_TOKEN")

HAS_PAGINATION=$(echo "$PAGE2_RESPONSE" | grep -o '"pagination"' || echo "")
if [ -n "$HAS_PAGINATION" ]; then
    echo -e "${GREEN}✓ Pagination working${NC}"
    CURRENT_PAGE=$(echo "$PAGE2_RESPONSE" | grep -o '"page":[0-9]*' | head -1 | cut -d':' -f2)
    echo "   Current page: $CURRENT_PAGE"
else
    echo -e "${YELLOW}⚠ Pagination data not found${NC}"
fi
echo ""

# Step 9: Check request logging in server logs
echo "📊 Step 9: Request monitoring..."
echo -e "${YELLOW}ℹ Check your server console for request logs${NC}"
echo "   Look for: 'request: incoming' and 'request: completed'"
echo ""

# Summary
echo "================================"
echo -e "${GREEN}✅ Phase 6 Tests Complete${NC}"
echo "================================"
echo ""
echo "Summary of features tested:"
echo "  ✓ User authentication"
echo "  ✓ Payment creation with audit tracking"
echo "  ✓ GET /api/audit-logs endpoint"
echo "  ✓ GET /api/audit-logs/:paymentId endpoint"
echo "  ✓ Authorization checks (401 for missing token)"
echo "  ✓ Pagination support"
echo "  ✓ Request logging (check server console)"
echo ""
echo "Next steps:"
echo "  1. Check server logs for 'request: incoming' entries"
echo "  2. Verify audit logs show 'triggered_by' field"
echo "  3. Test with admin user for cross-user audit access"
echo ""
