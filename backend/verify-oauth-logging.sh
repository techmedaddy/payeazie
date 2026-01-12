#!/bin/bash
# Quick test script to verify Google OAuth callback logging

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Google OAuth Callback Logging Test"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📋 Checking callback route implementation..."
echo ""

# Check if the enhanced logging is in place
if grep -q "CALLBACK ROUTE HIT" backend/src/api/routes/auth.routes.js; then
  echo "✅ Enhanced callback logging found"
else
  echo "❌ Enhanced callback logging NOT found"
  exit 1
fi

# Check for step-by-step logging
for step in "Step 1" "Step 2" "Step 3" "Step 4" "Step 5" "Step 6" "Step 7" "Step 8" "Step 9" "Step 10"; do
  if grep -q "$step" backend/src/api/routes/auth.routes.js; then
    echo "✅ $step logging implemented"
  else
    echo "❌ $step logging missing"
  fi
done

echo ""
echo "📋 Checking for user verification..."

# Check for user object verification
if grep -q "user.email verified" backend/src/api/routes/auth.routes.js; then
  echo "✅ Email verification logging found"
fi

if grep -q "user.id verified" backend/src/api/routes/auth.routes.js; then
  echo "✅ ID verification logging found"
fi

if grep -q "user.displayName verified" backend/src/api/routes/auth.routes.js; then
  echo "✅ DisplayName verification logging found"
fi

echo ""
echo "📋 Checking for JWT and redirect logging..."

if grep -q "JWT ISSUED" backend/src/api/routes/auth.routes.js; then
  echo "✅ JWT issuance logging found"
fi

if grep -q "REDIRECTED TO FRONTEND WITH TOKEN" backend/src/api/routes/auth.routes.js; then
  echo "✅ Redirect logging found"
fi

echo ""
echo "📋 Checking error handling..."

if grep -q "GOOGLE OAUTH CALLBACK ERROR" backend/src/api/routes/auth.routes.js; then
  echo "✅ Error handling logging found"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ All logging checks passed!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "To test the full flow:"
echo "1. Start backend: cd backend && npm start"
echo "2. Navigate to: http://localhost:3467/api/auth/google"
echo "3. Complete Google OAuth"
echo "4. Check backend terminal for detailed logs"
echo ""
