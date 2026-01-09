#!/bin/bash

# Generate a secure random JWT secret
generate_jwt_secret() {
  if command -v openssl &> /dev/null; then
    openssl rand -base64 64 | tr -d '\n'
  else
    # Fallback to /dev/urandom
    head -c 64 /dev/urandom | base64 | tr -d '\n'
  fi
}

echo "🔐 JWT Secret Generator"
echo "======================"
echo ""
echo "Generated JWT_SECRET:"
echo ""
generate_jwt_secret
echo ""
echo ""
echo "Add this to your backend/.env file:"
echo "JWT_SECRET=<paste_the_secret_above>"
echo ""
echo "⚠️  IMPORTANT:"
echo "  - Never commit this secret to version control"
echo "  - Use different secrets for dev/staging/production"
echo "  - Keep this secret safe and secure"
echo ""
