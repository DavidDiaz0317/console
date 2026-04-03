#!/bin/bash
# KubeStellar Console - Demo Mode Startup
# No credentials needed - runs with demo data and dev-user auto-login
#
# Usage:
#   ./startup-demo.sh       # run in foreground
#   ./startup-demo.sh &     # run in background

set -e
cd "$(dirname "$0")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${GREEN}=== KubeStellar Console - Demo Mode ===${NC}"
echo ""

# Environment
unset CLAUDECODE  # Allow AI Missions to spawn claude-code even when started from a Claude Code session
export DEV_MODE=true
export SKIP_ONBOARDING=true
export FRONTEND_URL=http://localhost:5174

# Create data directory
mkdir -p ./data

# Stop a process on a given port only if it belongs to this project.
# Unrelated processes are skipped with a warning to avoid disrupting other services.
kill_project_port() {
    local port="$1"
    local script_dir
    script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    local pids
    pids=$(lsof -ti ":$port" -sTCP:LISTEN 2>/dev/null || true)
    [ -z "$pids" ] && return 0
    for pid in $pids; do
        local cmd
        cmd=$(ps -p "$pid" -o args= 2>/dev/null || true)
        if echo "$cmd" | grep -qE "(cmd/console|kc-agent|[Vv]ite)" || \
           echo "$cmd" | grep -qF "$script_dir"; then
            echo -e "${YELLOW}Stopping KubeStellar Console process on port $port (PID $pid)...${NC}"
            kill -TERM "$pid" 2>/dev/null || true
            sleep 2
            kill -9 "$pid" 2>/dev/null || true
        else
            echo -e "${YELLOW}WARNING: Port $port is occupied by an unrelated process (PID $pid): $cmd${NC}"
            echo -e "${YELLOW}         Stop it manually if it conflicts with the console.${NC}"
        fi
    done
}

# Port cleanup
for p in 8080 5174; do
    kill_project_port "$p"
done

# Cleanup on exit
cleanup() {
    echo -e "\n${YELLOW}Shutting down...${NC}"
    kill $BACKEND_PID 2>/dev/null || true
    kill $FRONTEND_PID 2>/dev/null || true
    exit 0
}
trap cleanup SIGINT SIGTERM

# Start backend (dev mode, no OAuth needed)
echo -e "${GREEN}Starting backend (demo mode)...${NC}"
GOWORK=off go run ./cmd/console --dev &
BACKEND_PID=$!
sleep 2

# Start frontend
echo -e "${GREEN}Starting frontend...${NC}"
(cd web && npm run dev -- --port 5174) &
FRONTEND_PID=$!

echo ""
echo -e "${GREEN}=== Console is running in DEMO mode ===${NC}"
echo ""
echo -e "  Frontend: ${CYAN}http://localhost:5174${NC}"
echo -e "  Backend:  ${CYAN}http://localhost:8080${NC}"
echo ""
echo -e "  No login required - auto-signed in as dev-user"
echo -e "  Demo data is shown by default"
echo ""
echo "Press Ctrl+C to stop"

wait
