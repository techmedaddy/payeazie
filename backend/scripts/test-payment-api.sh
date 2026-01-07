#!/bin/bash

# Quick test script to verify the backend is working
# Usage: ./scripts/test-payment-api.sh

set -e  # Exit on error

echo "====================================="
echo "Testing Payment API"
echo "====================================="
echo

# Check if backend is running
echo "1. Checking if backend is running..."
if ! curl -f -s http://localhost:3467/health > /dev/null; then
    echo "   ❌ Backend is not running on http://localhost:3467"
    echo "   Start it with: npm start"
    exit 1
fi

echo "   ✅ Backend is running"
echo

# Generate a UUID for idempotency key (using uuidgen or a random string)
if command -v uuidgen &> /dev/null; then
    IDEMPOTENCY_KEY=$(uuidgen | tr '[:upper:]' '[:lower:]')
else
    # Fallback: generate a random hex string
    IDEMPOTENCY_KEY=$(cat /dev/urandom | tr -dc 'a-f0-9' | fold -w 36 | head -n 1)
fi

ORDER_ID="ORD-TEST-$(date +%s)"

echo "2. Creating payment intent..."
echo "   Order ID: $ORDER_ID"
echo "   Idempotency Key: $IDEMPOTENCY_KEY"
echo

# Create a payment intent
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3467/api/payments/intents \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  -d '{
    "orderId": "'"$ORDER_ID"'",
    "amount": 99.99,
    "currency": "USD"
  }')

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "   HTTP Status: $HTTP_CODE"
echo "   Response:"
echo "$BODY" | jq . 2>/dev/null || echo "$BODY"
echo

# Check if we got an ID back
if [ "$HTTP_CODE" != "200" ] && [ "$HTTP_CODE" != "202" ]; then
    echo "   ❌ Failed to create payment intent (HTTP $HTTP_CODE)"
    exit 1
fi

if ! echo "$BODY" | grep -q '"id"'; then
    echo "   ❌ Response doesn't contain payment ID"
    exit 1
fi

echo "   ✅ Payment intent created successfully!"
PAYMENT_ID=$(echo "$BODY" | jq -r '.id' 2>/dev/null)

if [ -z "$PAYMENT_ID" ] || [ "$PAYMENT_ID" = "null" ]; then
    echo "   ❌ Could not extract payment ID"
    exit 1
fi

echo "   Payment ID: $PAYMENT_ID"
echo

# Verify response structure
echo "3. Verifying response structure..."
HAS_ORDER_ID=$(echo "$BODY" | jq -r '.orderId' 2>/dev/null)
HAS_AMOUNT=$(echo "$BODY" | jq -r '.amount' 2>/dev/null)
HAS_CREATED_AT=$(echo "$BODY" | jq -r '.createdAt' 2>/dev/null)

if [ -z "$HAS_ORDER_ID" ] || [ "$HAS_ORDER_ID" = "null" ]; then
    echo "   ❌ Response missing 'orderId' field (should be camelCase)"
    exit 1
fi

if [ -z "$HAS_AMOUNT" ] || [ "$HAS_AMOUNT" = "null" ]; then
    echo "   ❌ Response missing 'amount' field"
    exit 1
fi

if [ -z "$HAS_CREATED_AT" ] || [ "$HAS_CREATED_AT" = "null" ]; then
    echo "   ❌ Response missing 'createdAt' field (should be camelCase)"
    exit 1
fi

echo "   ✅ Response has correct camelCase fields"
echo

# Test GET endpoint
echo "4. Testing GET /api/payments/$PAYMENT_ID..."
GET_RESPONSE=$(curl -s -w "\n%{http_code}" "http://localhost:3467/api/payments/$PAYMENT_ID")

GET_HTTP_CODE=$(echo "$GET_RESPONSE" | tail -n1)
GET_BODY=$(echo "$GET_RESPONSE" | sed '$d')

echo "   HTTP Status: $GET_HTTP_CODE"
echo "   Response:"
echo "$GET_BODY" | jq . 2>/dev/null || echo "$GET_BODY"
echo

if [ "$GET_HTTP_CODE" != "200" ]; then
    echo "   ❌ Failed to fetch payment (HTTP $GET_HTTP_CODE)"
    exit 1
fi

GET_PAYMENT_ID=$(echo "$GET_BODY" | jq -r '.id' 2>/dev/null)
if [ "$GET_PAYMENT_ID" != "$PAYMENT_ID" ]; then
    echo "   ❌ Payment ID mismatch (expected: $PAYMENT_ID, got: $GET_PAYMENT_ID)"
    exit 1
fi

echo "   ✅ Payment fetched successfully!"
echo

# Test idempotency
echo "5. Testing idempotency (duplicate request)..."
RESPONSE2=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3467/api/payments/intents \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  -d '{
    "orderId": "'"$ORDER_ID"'",
    "amount": 99.99,
    "currency": "USD"
  }')

HTTP_CODE2=$(echo "$RESPONSE2" | tail -n1)
BODY2=$(echo "$RESPONSE2" | sed '$d')
PAYMENT_ID2=$(echo "$BODY2" | jq -r '.id' 2>/dev/null)

echo "   HTTP Status: $HTTP_CODE2"
echo "   Payment ID: $PAYMENT_ID2"

if [ "$PAYMENT_ID2" != "$PAYMENT_ID" ]; then
    echo "   ❌ Idempotency failed! Got different payment ID"
    exit 1
fi

echo "   ✅ Idempotency working correctly (returned same payment)"
echo

echo "====================================="
echo "✅ All tests passed!"
echo "====================================="
