#!/bin/bash
# Verification script to check if the system is set up correctly

set -e

echo "Verifying IoT Anomaly Detection System Setup..."
echo ""

# Check Docker
echo "Checking Docker..."
if command -v docker &> /dev/null; then
    echo "[OK] Docker installed"
else
    echo "[ERROR] Docker not found. Please install Docker."
    exit 1
fi

# Check Docker Compose
echo "Checking Docker Compose..."
if command -v docker-compose &> /dev/null || docker compose version &> /dev/null; then
    echo "[OK] Docker Compose available"
else
    echo "[ERROR] Docker Compose not found."
    exit 1
fi

# Check Node.js
echo "Checking Node.js..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -ge 20 ]; then
        echo "[OK] Node.js $(node -v) installed"
    else
        echo "[WARN] Node.js version is $(node -v), recommended: 20+"
    fi
else
    echo "[WARN] Node.js not found (optional for local dev)"
fi

# Check CMake
echo "Checking CMake..."
if command -v cmake &> /dev/null; then
    echo "[OK] CMake $(cmake --version | head -n1 | cut -d' ' -f3) installed"
else
    echo "[WARN] CMake not found (required for C++ agent)"
fi

# Check libcurl
echo "Checking libcurl..."
if command -v curl-config &> /dev/null || pkg-config --exists libcurl; then
    echo "[OK] libcurl available"
else
    echo "[WARN] libcurl not found (required for C++ agent)"
fi

# Check backend dependencies
echo ""
echo "Checking backend dependencies..."
if [ -d "backend/node_modules" ]; then
    echo "[OK] Backend dependencies installed"
else
    echo "[WARN] Backend dependencies not installed. Run: cd backend && npm install"
fi

# Check dashboard dependencies
echo "Checking dashboard dependencies..."
if [ -d "dashboard/node_modules" ]; then
    echo "[OK] Dashboard dependencies installed"
else
    echo "[WARN] Dashboard dependencies not installed. Run: cd dashboard && npm install"
fi

# Check Prisma
echo "Checking Prisma..."
if [ -f "backend/node_modules/.bin/prisma" ]; then
    echo "[OK] Prisma installed"
else
    echo "[WARN] Prisma not found"
fi

# Check agent build
echo "Checking agent build..."
if [ -f "agent-cpp/build/agent" ]; then
    echo "[OK] Agent binary exists"
else
    echo "[WARN] Agent not built. Run: make run-agent"
fi

echo ""
echo "Setup verification complete!"
echo ""
echo "Next steps:"
echo "  1. Start services: cd infra && docker compose up --build"
echo "  2. Run agent: make run-agent"
echo "  3. Open dashboard: http://your-dashboard-url:3000"

