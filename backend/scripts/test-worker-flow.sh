#!/bin/bash

# Test script for payment status flow
# Tests: payment creation → worker processing → status updates → reconciliation

set -e

echo "========================================"
echo "Payment Status Flow Test"
echo "========================================"
echo

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if backend is running
echo "1. Checking backend..."
if ! curl -f -s http://localhost:3467/health > /dev/null; then
    echo -e "${RED}✗ Backend is not running${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Backend is running${NC}"
echo

# Generate UUID for idempotency
if command -v uuidgen &> /dev/null; then
    IDEMPOTENCY_KEY=$(uuidgen | tr '[:upper:]' '[:lower:]')
else
    IDEMPOTENCY_KEY=$(cat /dev/urandom | tr -dc 'a-f0-9' | fold -w 36 | head -n 1)
fi

ORDER_ID="ORD-WORKER-TEST-$(date +%s)"

echo "2. Creating payment intent..."
echo "   Order ID: $ORDER_ID"
echo "   Idempotency Key: $IDEMPOTENCY_KEY"

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3467/api/payments/intents \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  -d '{
    "orderId": "'"$ORDER_ID"'",
    "amount": 150.75,
    "currency": "USD"
  }')

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" != "200" ] && [ "$HTTP_CODE" != "202" ]; then
    echo -e "${RED}✗ Failed to create payment (HTTP $HTTP_CODE)${NC}"
    echo "$BODY"
    exit 1
fi

PAYMENT_ID=$(echo "$BODY" | jq -r '.id' 2>/dev/null)
INITIAL_STATUS=$(echo "$BODY" | jq -r '.status' 2>/dev/null)

echo -e "${GREEN}✓ Payment created${NC}"
echo "   Payment ID: $PAYMENT_ID"
echo "   Initial Status: $INITIAL_STATUS"
echo

# Wait for charge worker to process
echo "3. Waiting for charge worker to process (5 seconds)..."
sleep 5

# Check if status updated
echo "4. Checking payment status..."
CHECK_RESPONSE=$(curl -s -w "\n%{http_code}" "http://localhost:3467/api/payments/$PAYMENT_ID")
CHECK_HTTP_CODE=$(echo "$CHECK_RESPONSE" | tail -n1)
CHECK_BODY=$(echo "$CHECK_RESPONSE" | sed '$d')

if [ "$CHECK_HTTP_CODE" != "200" ]; then
    echo -e "${RED}✗ Failed to fetch payment (HTTP $CHECK_HTTP_CODE)${NC}"
    exit 1
fi

CURRENT_STATUS=$(echo "$CHECK_BODY" | jq -r '.status' 2>/dev/null)
GATEWAY_CHARGE_ID=$(echo "$CHECK_BODY" | jq -r '.gatewayChargeId' 2>/dev/null)

echo "   Current Status: $CURRENT_STATUS"
echo "   Gateway Charge ID: $GATEWAY_CHARGE_ID"

if [ "$GATEWAY_CHARGE_ID" == "null" ] || [ -z "$GATEWAY_CHARGE_ID" ]; then
    echo -e "${YELLOW}⚠ Worker hasn't processed yet (no gateway_charge_id)${NC}"
    echo "   This might mean:"
    echo "   - Worker is not running"
    echo "   - Redis connection issue"
    echo "   - Job is still in queue"
    echo
    echo "   Check backend logs for worker activity"
else
    echo -e "${GREEN}✓ Charge worker processed payment${NC}"
fi
echo

# Check if status is final
if [ "$CURRENT_STATUS" == "succeeded" ] || [ "$CURRENT_STATUS" == "failed" ]; then
    echo -e "${GREEN}✓ Payment reached final status: $CURRENT_STATUS${NC}"
elif [ "$CURRENT_STATUS" == "processing" ] && [ "$GATEWAY_CHARGE_ID" != "null" ]; then
    echo -e "${YELLOW}⚠ Payment still processing (gateway returned 'processing')${NC}"
    echo
    echo "5. Testing reconciliation..."
    
    # Trigger manual reconciliation
    RECONCILE_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3467/api/payments/reconcile)
    RECONCILE_HTTP_CODE=$(echo "$RECONCILE_RESPONSE" | tail -n1)
    
    if [ "$RECONCILE_HTTP_CODE" != "200" ]; then
        echo -e "${RED}✗ Failed to trigger reconciliation${NC}"
    else
        echo -e "${GREEN}✓ Reconciliation job queued${NC}"
        echo "   Waiting for reconciliation (5 seconds)..."
        sleep 5
        
        # Check status again
        FINAL_RESPONSE=$(curl -s "http://localhost:3467/api/payments/$PAYMENT_ID")
        FINAL_STATUS=$(echo "$FINAL_RESPONSE" | jq -r '.status' 2>/dev/null)
        
        echo "   Final Status: $FINAL_STATUS"
        
        if [ "$FINAL_STATUS" == "succeeded" ] || [ "$FINAL_STATUS" == "failed" ]; then
            echo -e "${GREEN}✓ Reconciliation updated payment to final status${NC}"
        else
            echo -e "${YELLOW}⚠ Payment still in non-final status${NC}"
            echo "   This is normal if gateway is slow to process"
        fi
    fi
else
    echo -e "${YELLOW}⚠ Payment still in initial status${NC}"
    echo "   Check if workers are running properly"
fi
echo

# Display full payment details
echo "6. Final payment details:"
echo "$CHECK_BODY" | jq . 2>/dev/null || echo "$CHECK_BODY"
echo

# Summary
echo "========================================"
echo "Test Summary"
echo "========================================"
echo "Payment ID: $PAYMENT_ID"
echo "Initial Status: $INITIAL_STATUS"
echo "Current Status: $CURRENT_STATUS"
echo "Gateway Charge ID: ${GATEWAY_CHARGE_ID:-'Not set'}"
echo

if [ "$GATEWAY_CHARGE_ID" != "null" ] && [ ! -z "$GATEWAY_CHARGE_ID" ]; then
    echo -e "${GREEN}✓ Payment flow working correctly!${NC}"
    echo
    echo "What happened:"
    echo "1. Payment created with status 'processing'"
    echo "2. Job queued to 'payment_charge' queue"
    echo "3. Charge worker picked up job"
    echo "4. Worker called gateway and got charge ID"
    echo "5. Payment updated with gateway_charge_id and status"
    
    if [ "$CURRENT_STATUS" == "processing" ]; then
        echo "6. Reconciliation can update status later"
    fi
else
    echo -e "${RED}✗ Payment flow incomplete${NC}"
    echo
    echo "Possible issues:"
    echo "- Workers not started (check server.js)"
    echo "- Redis not running or not connected"
    echo "- Queue configuration error"
    echo
    echo "Check backend logs for errors"
fi
