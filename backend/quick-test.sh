#!/bin/bash
# Quick test script to verify payment lifecycle fixes
# Usage: ./quick-test.sh

set -e

echo "============================================"
echo "Payment Lifecycle Quick Test"
echo "============================================"
echo ""

# Check if services are running
check_service() {
    local port=$1
    local name=$2
    if nc -z localhost $port 2>/dev/null; then
        echo "✅ $name is running on port $port"
        return 0
    else
        echo "❌ $name is NOT running on port $port"
        return 1
    fi
}

echo "1. Checking services..."
check_service 3000 "Backend API" || {
    echo "   Start with: cd backend && npm start"
    exit 1
}

echo ""
echo "2. Creating test payment..."
RESPONSE=$(curl -s -X POST http://localhost:3000/api/payments \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 5000,
    "currency": "USD",
    "orderId": "quicktest-'$(date +%s)'"
  }')

if [ -z "$RESPONSE" ]; then
    echo "❌ Failed to create payment (no response)"
    exit 1
fi

PAYMENT_ID=$(echo $RESPONSE | jq -r '.payment.id // empty')
INITIAL_STATUS=$(echo $RESPONSE | jq -r '.payment.status // empty')

if [ -z "$PAYMENT_ID" ]; then
    echo "❌ Failed to parse payment ID"
    echo "Response: $RESPONSE"
    exit 1
fi

echo "   Payment ID: $PAYMENT_ID"
echo "   Initial Status: $INITIAL_STATUS"

if [ "$INITIAL_STATUS" != "pending" ]; then
    echo "⚠️  Warning: Initial status should be 'pending', got '$INITIAL_STATUS'"
fi

echo ""
echo "3. Waiting for worker to process (3 seconds)..."
sleep 3

echo ""
echo "4. Checking final status..."
FINAL_RESPONSE=$(curl -s http://localhost:3000/api/payments/$PAYMENT_ID)
FINAL_STATUS=$(echo $FINAL_RESPONSE | jq -r '.status // empty')
GATEWAY_ID=$(echo $FINAL_RESPONSE | jq -r '.gatewayChargeId // empty')

echo "   Final Status: $FINAL_STATUS"
echo "   Gateway Charge ID: $GATEWAY_ID"

echo ""
echo "5. Verifying lifecycle..."

if [ "$FINAL_STATUS" = "succeeded" ] || [ "$FINAL_STATUS" = "failed" ]; then
    echo "✅ SUCCESS: Payment reached terminal status: $FINAL_STATUS"
    echo ""
    echo "Expected log flow:"
    echo "  • charge.worker: transitioned to processing"
    echo "  • gatewayClient.charge simulated (status: $FINAL_STATUS)"
    echo "  • charge.worker gateway responded (gatewayStatus: $FINAL_STATUS)"
    echo "  • charge.worker: determining final status (finalStatus: $FINAL_STATUS)"
    echo "  • charge.worker: transitioned to $FINAL_STATUS"
    echo ""
    
    if [ -n "$GATEWAY_ID" ] && [ "$GATEWAY_ID" != "null" ]; then
        echo "✅ Gateway charge ID recorded: $GATEWAY_ID"
    else
        echo "⚠️  Warning: No gateway charge ID recorded"
    fi
    
    exit 0
elif [ "$FINAL_STATUS" = "processing" ]; then
    echo "❌ FAILED: Payment is STUCK at 'processing'"
    echo ""
    echo "This means the fix did not work. Check:"
    echo "  1. Is charge.worker.js running?"
    echo "  2. Check worker logs for errors"
    echo "  3. Verify chargeResult scope in charge.worker.js"
    echo ""
    exit 1
elif [ "$FINAL_STATUS" = "pending" ]; then
    echo "⚠️  WARNING: Payment is still 'pending'"
    echo ""
    echo "Possible causes:"
    echo "  1. charge.worker.js is not running"
    echo "  2. Redis connection issue"
    echo "  3. Job not added to queue"
    echo ""
    exit 1
else
    echo "❌ FAILED: Unexpected status '$FINAL_STATUS'"
    exit 1
fi
