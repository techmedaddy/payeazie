#!/bin/bash

# Payeazie Backend Startup Script
# Validates environment, runs migrations, starts server

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   Payeazie Backend - Startup & Verification"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${RED}✗ .env file not found!${NC}"
    echo "  Please create .env with required variables:"
    echo "    DATABASE_URL=postgresql://user:pass@localhost:5432/dbname"
    echo "    REDIS_URL=redis://localhost:6379"
    echo "    PORT=3467"
    exit 1
fi

echo -e "${GREEN}✓${NC} .env file found"

# Source .env file
set -a
source .env
set +a

# Validate required environment variables
echo ""
echo "🔍 Validating environment variables..."

missing_vars=()

if [ -z "$DATABASE_URL" ]; then
    missing_vars+=("DATABASE_URL")
fi

if [ -z "$REDIS_URL" ]; then
    missing_vars+=("REDIS_URL")
fi

if [ ${#missing_vars[@]} -gt 0 ]; then
    echo -e "${RED}✗ Missing required environment variables:${NC}"
    for var in "${missing_vars[@]}"; do
        echo "  - $var"
    done
    exit 1
fi

echo -e "${GREEN}✓${NC} DATABASE_URL configured"
echo -e "${GREEN}✓${NC} REDIS_URL configured"
echo -e "${GREEN}✓${NC} PORT=${PORT:-3467}"

# Test PostgreSQL connection
echo ""
echo "🔍 Testing PostgreSQL connection..."
if psql "$DATABASE_URL" -c "SELECT 1" > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} PostgreSQL is reachable"
else
    echo -e "${RED}✗ Cannot connect to PostgreSQL${NC}"
    echo "  Connection string: ${DATABASE_URL}"
    exit 1
fi

# Test Redis connection
echo ""
echo "🔍 Testing Redis connection..."
if redis-cli -u "$REDIS_URL" PING > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Redis is reachable"
else
    echo -e "${YELLOW}⚠${NC}  Cannot verify Redis connection (redis-cli not available)"
    echo "  Server will test connection on startup"
fi

# Check if node_modules exists
echo ""
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}⚠${NC}  node_modules not found, installing dependencies..."
    npm install
else
    echo -e "${GREEN}✓${NC} Dependencies installed"
fi

# Run migrations
echo ""
echo "📦 Running database migrations..."
node scripts/migrate.js
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} Migrations completed"
else
    echo -e "${RED}✗ Migrations failed${NC}"
    exit 1
fi

# Start server
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 Starting Payeazie Backend Server..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

node server.js
