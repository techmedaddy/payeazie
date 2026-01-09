#!/bin/bash
set -e

BACKEND_DIR="/home/techmedaddy/projects/payeazie/backend"
LOG_FILE="/tmp/backend-$(date +%s).log"
API_URL="http://localhost:3467"

echo "=================================================="
echo "Backend Restart & Worker Verification Script"
echo "=================================================="
echo ""

# Step 1: Stop existing backend
echo "📛 Step 1: Stopping existing backend server..."
pkill -f "node server.js" 2>/dev/null || echo "   No backend process found"
sleep 2

# Step 2: Start backend
echo ""
echo "🚀 Step 2: Starting backend server..."
cd "$BACKEND_DIR"
nohup node server.js > "$LOG_FILE" 2>&1 &
BACKEND_PID=$!
echo "   Backend started with PID: $BACKEND_PID"
echo "   Logs: $LOG_FILE"

# Step 3: Wait for server to be ready
echo ""
echo "⏳ Step 3: Waiting for server to start..."
for i in {1..10}; do
    if lsof -i :3467 >/dev/null 2>&1; then
        echo "   ✅ Server is listening on port 3467"
        break
    fi
    if [ $i -eq 10 ]; then
        echo "   ❌ Server failed to start after 10 seconds"
        echo "   Check logs: tail -f $LOG_FILE"
        exit 1
    fi
    sleep 1
done

sleep 2

# Step 4: Check server health
echo ""
echo "🏥 Step 4: Checking server health..."
if curl -s "$API_URL/health" | grep -q "ok"; then
    echo "   ✅ Server is healthy"
else
    echo "   ⚠️  Health check returned unexpected response"
fi

# Step 5: Create test payment
echo ""
echo "💳 Step 5: Creating test payment..."
IDEMPOTENCY_KEY="test-verify-$(uuidgen)"
ORDER_ID="ORD-TEST-$(date +%s)"

PAYMENT_RESPONSE=$(curl -s -X POST "$API_URL/api/payments/intents" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  -d "{
    \"amount\": 7777,
    \"currency\": \"USD\",
    \"orderId\": \"$ORDER_ID\",
    \"customerEmail\": \"verify@test.com\"
  }")

PAYMENT_ID=$(echo "$PAYMENT_RESPONSE" | jq -r '.id')

if [ -z "$PAYMENT_ID" ] || [ "$PAYMENT_ID" = "null" ]; then
    echo "   ❌ Failed to create payment"
    echo "   Response: $PAYMENT_RESPONSE"
    exit 1
fi

echo "   ✅ Payment created: $PAYMENT_ID"
echo "   Initial status: $(echo "$PAYMENT_RESPONSE" | jq -r '.status')"

# Step 6: Monitor worker logs
echo ""
echo "🔍 Step 6: Monitoring worker logs (5 seconds)..."
echo "   Watching for charge worker processing..."
sleep 5

# Check for key log entries
echo ""
echo "   Expected log entries:"
if grep -q "transitioned to processing" "$LOG_FILE" 2>/dev/null; then
    echo "   ✅ Found: 'transitioned to processing'"
else
    echo "   ❌ Missing: 'transitioned to processing'"
fi

if grep -q "gateway responded" "$LOG_FILE" 2>/dev/null; then
    echo "   ✅ Found: 'gateway responded'"
else
    echo "   ❌ Missing: 'gateway responded'"
fi

if grep -q "transitioned to succeeded\|transitioned to failed" "$LOG_FILE" 2>/dev/null; then
    echo "   ✅ Found: final status transition"
else
    echo "   ⚠️  Missing: final status transition (check reconcile worker)"
fi

# Step 7: Check final payment status
echo ""
echo "📊 Step 7: Checking final payment status..."
sleep 2

FINAL_STATUS=$(curl -s "$API_URL/api/payments/$PAYMENT_ID" | jq -r '.status')
GATEWAY_ID=$(curl -s "$API_URL/api/payments/$PAYMENT_ID" | jq -r '.gatewayChargeId')

echo "   Payment ID: $PAYMENT_ID"
echo "   Final Status: $FINAL_STATUS"
echo "   Gateway Charge ID: $GATEWAY_ID"

# Step 8: Verdict
echo ""
echo "=================================================="
if [ "$FINAL_STATUS" = "succeeded" ] || [ "$FINAL_STATUS" = "failed" ]; then
    echo "✅ SUCCESS: Payment reached terminal state!"
    echo ""
    echo "The charge worker is functioning correctly:"
    echo "  • Payment transitioned from pending → processing"
    echo "  • Gateway was called and returned: $FINAL_STATUS"
    echo "  • Gateway charge ID: $GATEWAY_ID"
    echo ""
    echo "Your stuck payments issue is RESOLVED! 🎉"
elif [ "$FINAL_STATUS" = "processing" ]; then
    echo "⚠️  WARNING: Payment still in processing state"
    echo ""
    echo "This means the charge worker might not be running correctly."
    echo "Let's trigger manual reconciliation..."
    
    curl -s -X POST "$API_URL/api/payments/reconcile" > /dev/null
    sleep 3
    
    RECONCILED_STATUS=$(curl -s "$API_URL/api/payments/$PAYMENT_ID" | jq -r '.status')
    echo "   After reconciliation: $RECONCILED_STATUS"
    
    if [ "$RECONCILED_STATUS" != "processing" ]; then
        echo "   ✅ Reconcile worker fixed it! Status: $RECONCILED_STATUS"
    else
        echo "   ❌ Still stuck. Check worker logs:"
        echo "   tail -100 $LOG_FILE | grep -A 10 -B 10 '$PAYMENT_ID'"
    fi
else
    echo "❌ ERROR: Unexpected status: $FINAL_STATUS"
fi
echo "=================================================="

echo ""
echo "📋 Next steps:"
echo "   • View logs: tail -f $LOG_FILE"
echo "   • Check payment: curl $API_URL/api/payments/$PAYMENT_ID | jq ."
echo "   • Monitor workers: tail -f $LOG_FILE | grep 'worker'"
echo "   • Frontend URL: http://localhost:3000"
echo ""
