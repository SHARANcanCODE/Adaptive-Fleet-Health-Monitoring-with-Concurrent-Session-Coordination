# Quick Start Guide

## Prerequisites

- Docker & Docker Compose
- Node.js 20+ (for local development)
- CMake 3.10+ and libcurl (for C++ agent)
- Make

## 1. Start Services

```bash
cd infra
docker compose up --build
```

This starts:
- PostgreSQL on port 5432
- Backend API on http://your-backend-url:8080
- Dashboard on http://your-dashboard-url:3000

Wait for all services to be healthy (check with `docker compose ps`).

## 2. Run Agent

In a new terminal:

```bash
make run-agent
```

Or manually:

```bash
cd agent-cpp
mkdir -p build && cd build
cmake ..
make
./agent
```

## 3. View Dashboard

Open http://your-dashboard-url:3000 in your browser.

You should see:
- Real-time metrics streaming
- Anomalies being detected
- Device details and charts

## 4. Test API

```bash
# Health check
curl http://your-backend-url:8080/api/health

# List devices
curl http://your-backend-url:8080/api/devices

# Query metrics
curl "http://your-backend-url:8080/api/metrics?deviceId=sim-device-001&limit=10"

# Query anomalies
curl "http://your-backend-url:8080/api/anomalies?limit=10"
```

## Troubleshooting

### Database not connecting
```bash
cd infra
docker compose logs db
```

### Backend not starting
```bash
cd infra
docker compose logs backend
```

### Agent not connecting
- Verify backend is running: `curl http://your-backend-url:8080/api/health`
- Check agent config: `cat agent-cpp/config/agent.json`
- Verify network connectivity

### No anomalies detected
- Increase anomaly probability in agent config
- Check anomaly engine: `ANOMALY_ENGINE=zscore` vs `isoforest`
- Verify metrics are being ingested

## Environment Variables

Copy `.env.example` to `.env` and customize:

```bash
cp .env.example .env
```

Key variables:
- `DATABASE_URL` - PostgreSQL connection string
- `ANOMALY_ENGINE` - `isoforest` or `zscore`
- `NEXT_PUBLIC_BACKEND_URL` - Backend URL for dashboard

## Stopping Services

```bash
cd infra
docker compose down
```

To remove volumes (clean slate):

```bash
cd infra
docker compose down -v
```

