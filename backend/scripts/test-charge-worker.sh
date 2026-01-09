#!/bin/bash

echo "🔄 Testing Charge Worker with Fixed Code"
echo "========================================"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 1. Stop existing backend
echo "1️⃣  Stopping existing backend..."
pkill -f "node server.js" 2>/dev/null
sleep 2

# 2. Start backend
echo "2️⃣  Starting backend server..."
cd /home/techmedaddy/projects/payeazie/backend
node server.js > /tmp/backend-test.log 2>&1 &
BACKEND_PID=$!
echo -e "${GREEN}Backend started with PID: $BACKEND_PID${NC}"
sleep 3

# 3. Check if backend is running
if lsof -i :3467 >/dev/null 2>&1; then
    echo -e "${GREEN}✅ Backend is listening on port 3467${NC}"
else
    echo -e "${RED}❌ Backend failed to start!${NC}"
    tail -20 /tmp/backend-test.log
    exit 1
fi

# 4. Create test payment
echo ""
echo "3️⃣  Creating test payment..."
IDEMPOTENCY_KEY="test-$(uuidgen)"
ORDER_ID="ORD-TEST-$(date +%s)"

PAYMENT_RESPONSE=$(curl -s -X POST http://localhost:3467/api/payments/intents \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  -d "{
    \"amount\": 9999,
    \"currency\": \"USD\",
    \"orderId\": \"$ORDER_ID\",
    \"customerEmail\": \"test@example.com\"
  }")

PAYMENT_ID=$(echo "$PAYMENT_RESPONSE" | jq -r '.id')

if [ "$PAYMENT_ID" == "null" ] || [ -z "$PAYMENT_ID" ]; then
    echo -e "${RED}❌ Failed to create payment!${NC}"
    echo "Response: $PAYMENT_RESPONSE"
    exit 1
fi

echo -e "${GREEN}✅ Payment created: $PAYMENT_ID${NC}"
INITIAL_STATUS=$(echo "$PAYMENT_RESPONSE" | jq -r '.status')
echo "   Initial status: $INITIAL_STATUS"

# 5. Wait for worker to process
echo ""
echo "4️⃣  Waiting 3 seconds for charge worker to process..."
sleep 3

# 6. Check final status
echo ""
echo "5️⃣  Checking final payment status..."
FINAL_RESPONSE=$(curl -s http://localhost:3467/api/payments/$PAYMENT_ID)
FINAL_STATUS=$(echo "$FINAL_RESPONSE" | jq -r '.status')
GATEWAY_CHARGE_ID=$(echo "$FINAL_RESPONSE" | jq -r '.gatewayChargeId')

echo "   Payment ID: $PAYMENT_ID"
echo "   Final status: $FINAL_STATUS"
echo "   Gateway Charge ID: $GATEWAY_CHARGE_ID"

# 7. Check worker logs
echo ""
echo "6️⃣  Charge worker logs for this payment:"
echo "=========================================="
grep "$PAYMENT_ID" /tmp/backend-test.log | grep -E "(charge.worker|gateway)" | tail -10

# 8. Verify success
echo ""
echo "7️⃣  Verification Results:"
echo "=========================================="

if [ "$FINAL_STATUS" == "succeeded" ] || [ "$FINAL_STATUS" == "failed" ]; then
    echo -e "${GREEN}✅ SUCCESS: Payment transitioned to terminal status '$FINAL_STATUS'${NC}"
    if [ "$GATEWAY_CHARGE_ID" != "null" ] && [ -n "$GATEWAY_CHARGE_ID" ]; then
        echo -e "${GREEN}✅ Gateway charge ID is set: $GATEWAY_CHARGE_ID${NC}"
    else
        echo -e "${YELLOW}⚠️  Gateway charge ID is missing${NC}"
    fi
else
    echo -e "${RED}❌ FAIL: Payment stuck at status '$FINAL_STATUS'${NC}"
    echo ""
    echo "Full backend log:"
    tail -50 /tmp/backend-test.log
    exit 1
fi

echo ""
echo -e "${GREEN}🎉 All tests passed!${NC}"
echo ""
echo "Backend is still running (PID: $BACKEND_PID)"
echo "View logs: tail -f /tmp/backend-test.log"
echo "Stop backend: kill $BACKEND_PID"
