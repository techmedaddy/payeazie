#!/bin/bash

# Real-time monitoring dashboard for payment processing system
# Shows queue status, recent payments, and worker activity

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

BACKEND_URL="http://localhost:3467"
REDIS_CLI="redis-cli"
REFRESH_INTERVAL=2

clear

while true; do
    # Move cursor to top
    tput cup 0 0
    
    echo -e "${BOLD}═══════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}     Payment Processing System - Live Monitor${NC}"
    echo -e "${BOLD}═══════════════════════════════════════════════════════${NC}"
    echo
    echo -e "${CYAN}Updated: $(date '+%Y-%m-%d %H:%M:%S')${NC}"
    echo
    
    # System Status
    echo -e "${BLUE}╔══ System Status ══════════════════════════════════════╗${NC}"
    
    # Backend health
    if curl -f -s "$BACKEND_URL/health" > /dev/null 2>&1; then
        echo -e "  Backend:    ${GREEN}● Online${NC}"
    else
        echo -e "  Backend:    ${RED}● Offline${NC}"
    fi
    
    # Redis health
    if $REDIS_CLI ping > /dev/null 2>&1; then
        echo -e "  Redis:      ${GREEN}● Connected${NC}"
    else
        echo -e "  Redis:      ${RED}● Disconnected${NC}"
    fi
    
    echo -e "${BLUE}╚═══════════════════════════════════════════════════════╝${NC}"
    echo
    
    # Queue Status
    echo -e "${BLUE}╔══ Queue Status (payment_charge) ══════════════════════╗${NC}"
    
    ACTIVE=$($REDIS_CLI LLEN "bull:payment_charge:active" 2>/dev/null || echo "0")
    WAITING=$($REDIS_CLI LLEN "bull:payment_charge:wait" 2>/dev/null || echo "0")
    COMPLETED=$($REDIS_CLI ZCARD "bull:payment_charge:completed" 2>/dev/null || echo "0")
    FAILED=$($REDIS_CLI ZCARD "bull:payment_charge:failed" 2>/dev/null || echo "0")
    
    printf "  %-20s %s\n" "Active Jobs:" "$ACTIVE"
    printf "  %-20s %s\n" "Waiting Jobs:" "$WAITING"
    printf "  %-20s ${GREEN}%s${NC}\n" "Completed Jobs:" "$COMPLETED"
    
    if [ "$FAILED" -gt 0 ]; then
        printf "  %-20s ${RED}%s${NC}\n" "Failed Jobs:" "$FAILED"
    else
        printf "  %-20s %s\n" "Failed Jobs:" "$FAILED"
    fi
    
    echo -e "${BLUE}╚═══════════════════════════════════════════════════════╝${NC}"
    echo
    
    # Reconciliation Queue
    echo -e "${BLUE}╔══ Queue Status (payment_reconcile) ═══════════════════╗${NC}"
    
    REC_ACTIVE=$($REDIS_CLI LLEN "bull:payment_reconcile:active" 2>/dev/null || echo "0")
    REC_WAITING=$($REDIS_CLI LLEN "bull:payment_reconcile:wait" 2>/dev/null || echo "0")
    REC_COMPLETED=$($REDIS_CLI ZCARD "bull:payment_reconcile:completed" 2>/dev/null || echo "0")
    
    printf "  %-20s %s\n" "Active Jobs:" "$REC_ACTIVE"
    printf "  %-20s %s\n" "Waiting Jobs:" "$REC_WAITING"
    printf "  %-20s ${GREEN}%s${NC}\n" "Completed Jobs:" "$REC_COMPLETED"
    
    echo -e "${BLUE}╚═══════════════════════════════════════════════════════╝${NC}"
    echo
    
    # Recent Activity (from localStorage if accessible, or show instructions)
    echo -e "${BLUE}╔══ Quick Actions ══════════════════════════════════════╗${NC}"
    echo "  [1] Trigger manual reconciliation:"
    echo "      curl -X POST $BACKEND_URL/api/payments/reconcile"
    echo
    echo "  [2] Create test payment:"
    echo "      ./scripts/test-worker-flow.sh"
    echo
    echo "  [3] View worker logs:"
    echo "      Check server console output"
    echo -e "${BLUE}╚═══════════════════════════════════════════════════════╝${NC}"
    echo
    
    echo -e "${CYAN}Press Ctrl+C to exit${NC}"
    echo -e "${CYAN}Refreshing every ${REFRESH_INTERVAL}s...${NC}"
    
    # Clear rest of screen
    tput ed
    
    sleep $REFRESH_INTERVAL
done
