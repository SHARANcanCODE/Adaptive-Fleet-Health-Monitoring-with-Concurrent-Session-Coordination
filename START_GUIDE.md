# Quick Start Guide

## Services Status

The backend is now running successfully!

- **Backend API**: http://your-backend-url:8080
- **Database**: PostgreSQL on port 5432  
- **Dashboard**: Port 3000 is currently in use (see below)

## Current Status

```bash
# Check service status
cd infra && docker compose ps

# Check backend health
curl http://your-backend-url:8080/api/health

# View backend logs
cd infra && docker compose logs -f backend
```

## Next Steps

### Option 1: Free Port 3000 (Recommended)

If you have something running on port 3000, stop it first:

```bash
# Find what's using port 3000
lsof -ti:3000

# Kill the process (replace PID with actual process ID)
kill -9 <PID>

# Then start dashboard
cd infra && docker compose up -d dashboard
```

### Option 2: Change Dashboard Port

Edit `infra/docker-compose.yml` and change the dashboard port mapping:

```yaml
dashboard:
  ports:
    - "3001:3000"  # Change 3000 to 3001
```

Then restart:
```bash
cd infra && docker compose up -d dashboard
```

Access dashboard at: http://your-dashboard-url:3001

## Run the Agent

Once services are running, start the C++ agent in a new terminal:

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

## Test the System

1. **Check backend health:**
   ```bash
   curl http://your-backend-url:8080/api/health
   ```

2. **List devices:**
   ```bash
   curl http://your-backend-url:8080/api/devices
   ```

3. **Send test metrics:**
   ```bash
   curl -X POST http://your-backend-url:8080/api/ingest \
     -H "Content-Type: application/json" \
     -d '{
       "deviceId": "test-device-001",
       "metrics": [{
         "temperature_c": 22.5,
         "vibration_g": 0.02,
         "humidity_pct": 45.0,
         "voltage_v": 4.9
       }]
     }'
   ```

4. **View dashboard:**
   Open http://your-dashboard-url:3000 (or 3001 if you changed the port)

## Troubleshooting

- **Backend not starting**: Check logs with `docker compose logs backend`
- **Database connection issues**: Ensure PostgreSQL container is healthy
- **Port conflicts**: Change ports in `docker-compose.yml` or stop conflicting services
- **Agent not connecting**: Verify backend is running: `curl http://your-backend-url:8080/api/health`

