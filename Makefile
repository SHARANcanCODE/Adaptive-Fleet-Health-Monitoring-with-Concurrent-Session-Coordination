.PHONY: setup dev build clean down db-migrate db-seed run-agent lint test format

# Default target
.DEFAULT_GOAL := help

help:
	@echo "Available targets:"
	@echo "  setup        - Install dependencies across all services"
	@echo "  verify       - Verify system setup and dependencies"
	@echo "  dev          - Start all services (backend, db, dashboard) with docker compose"
	@echo "  build        - Build all services"
	@echo "  db-migrate   - Run Prisma migrations"
	@echo "  db-seed      - Seed database with demo devices"
	@echo "  run-agent    - Build and run C++ agent simulator (with local analytics)"
	@echo "  run-vibration - Build and run vibration sensor module (with FFT analysis)"
	@echo "  run-agent-c  - Build and run C MQTT client (EdgeFlow mode)"
	@echo "  dev-mqtt     - Start stack with MQTT + Python ML enabled"
	@echo "  bench-ingest - Benchmark MQTT ingestion (if available)"
	@echo "  lint         - Lint all services"
	@echo "  test         - Run tests across all services"
	@echo "  format       - Format code across services"
	@echo "  clean        - Clean build artifacts and docker volumes"
	@echo "  down         - Stop and remove docker containers and volumes"

verify:
	@echo "Verifying setup..."
	@bash scripts/verify-setup.sh

setup:
	@echo "Installing backend dependencies..."
	cd backend && npm install
	@echo "Installing dashboard dependencies..."
	cd dashboard && npm install
	@echo "Setup complete!"

dev:
	@echo "Starting services with docker compose..."
	cd infra && docker compose up --build

run-agent:
	@echo "Building and running C++ agent (with local analytics)..."
	cd agent-cpp && mkdir -p build && cd build && cmake .. && make && ./agent

run-vibration:
	@echo "Building and running vibration sensor module (with FFT analysis)..."
	cd agent-cpp && mkdir -p build && cd build && cmake .. && make && ./vibration_sensor

run-agent-c:
	@echo "Building and running C MQTT client..."
	cd agent-c && mkdir -p build && cd build && cmake .. && make && ./agent-c

dev-mqtt:
	@echo "Starting stack with MQTT + Python ML enabled..."
	cd infra && MQTT_ENABLE=true PY_ML_ENABLE=true docker compose up --build

bench-ingest:
	@echo "MQTT benchmark tool not yet implemented"
	@echo "To manually test, run: make run-agent-c"

build:
	@echo "Building backend..."
	cd backend && npm run build
	@echo "Building dashboard..."
	cd dashboard && npm run build
	@echo "Building agent..."
	cd agent-cpp && mkdir -p build && cd build && cmake .. && make

db-migrate:
	@echo "Running Prisma migrations..."
	cd backend && npx prisma migrate dev

db-seed:
	@echo "Seeding database..."
	cd backend && npm run seed

lint:
	@echo "Linting backend..."
	cd backend && npm run lint || true
	@echo "Linting dashboard..."
	cd dashboard && npm run lint || true

test:
	@echo "Testing backend..."
	cd backend && npm test || true
	@echo "Testing dashboard..."
	cd dashboard && npm test || true

format:
	@echo "Formatting backend..."
	cd backend && npm run format || true
	@echo "Formatting dashboard..."
	cd dashboard && npm run format || true

clean:
	@echo "Cleaning build artifacts..."
	rm -rf agent-cpp/build agent-cpp/cmake-build-*
	rm -rf backend/dist backend/node_modules/.cache
	rm -rf dashboard/.next dashboard/node_modules/.cache
	@echo "Cleaning docker volumes..."
	cd infra && docker compose down -v || true

down:
	@echo "Stopping docker containers..."
	cd infra && docker compose down -v

