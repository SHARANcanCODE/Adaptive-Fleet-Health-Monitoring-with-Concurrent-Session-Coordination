# API Examples

## Ingest Metrics

```bash
curl -X POST http://your-backend-url:8080/api/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "sim-device-001",
    "metrics": [
      {
        "ts": "2024-01-01T12:00:00Z",
        "temperature_c": 22.5,
        "vibration_g": 0.02,
        "humidity_pct": 45.0,
        "voltage_v": 4.9
      },
      {
        "ts": "2024-01-01T12:00:01Z",
        "temperature_c": 22.7,
        "vibration_g": 0.03,
        "humidity_pct": 45.2,
        "voltage_v": 4.91
      }
    ]
  }'
```

**Response:**
```json
{
  "success": true,
  "metricsInserted": 2,
  "anomaliesDetected": 0,
  "deviceId": "sim-device-001"
}
```

## List Devices

```bash
curl http://your-backend-url:8080/api/devices
```

**Response:**
```json
{
  "devices": [
    {
      "id": "sim-device-001",
      "name": "Raspberry Pi Sensor Hub 1",
      "location": "Building A, Floor 2",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "_count": {
        "metrics": 150,
        "anomalies": 5
      }
    }
  ],
  "count": 1
}
```

## Get Device by ID

```bash
curl http://your-backend-url:8080/api/devices/sim-device-001
```

## Create Device

```bash
curl -X POST http://your-backend-url:8080/api/devices \
  -H "Content-Type: application/json" \
  -d '{
    "name": "New Device",
    "location": "Building B"
  }'
```

## Query Metrics

```bash
# Get latest 100 metrics for a device
curl "http://your-backend-url:8080/api/metrics?deviceId=sim-device-001&limit=100"

# Get metrics in time range
curl "http://your-backend-url:8080/api/metrics?deviceId=sim-device-001&from=2024-01-01T00:00:00Z&to=2024-01-01T23:59:59Z&limit=1000"

# Get all metrics (paginated)
curl "http://your-backend-url:8080/api/metrics?limit=50&offset=0"
```

**Response:**
```json
{
  "metrics": [
    {
      "id": "uuid-here",
      "deviceId": "sim-device-001",
      "ts": "2024-01-01T12:00:00.000Z",
      "temperature_c": 22.5,
      "vibration_g": 0.02,
      "humidity_pct": 45.0,
      "voltage_v": 4.9,
      "device": {
        "id": "sim-device-001",
        "name": "Raspberry Pi Sensor Hub 1",
        "location": "Building A, Floor 2"
      }
    }
  ],
  "pagination": {
    "total": 150,
    "limit": 100,
    "offset": 0,
    "hasMore": true
  }
}
```

## Query Anomalies

```bash
# Get latest anomalies
curl "http://your-backend-url:8080/api/anomalies?limit=50"

# Filter by device
curl "http://your-backend-url:8080/api/anomalies?deviceId=sim-device-001&limit=50"

# Filter by type
curl "http://your-backend-url:8080/api/anomalies?type=isoforest&limit=50"

# Filter by time range
curl "http://your-backend-url:8080/api/anomalies?from=2024-01-01T00:00:00Z&to=2024-01-01T23:59:59Z&limit=100"
```

**Response:**
```json
{
  "anomalies": [
    {
      "id": "uuid-here",
      "deviceId": "sim-device-001",
      "metricId": "metric-uuid",
      "ts": "2024-01-01T12:05:00.000Z",
      "score": 5.2,
      "type": "isoforest",
      "flagged": true,
      "device": {
        "id": "sim-device-001",
        "name": "Raspberry Pi Sensor Hub 1",
        "location": "Building A, Floor 2"
      },
      "metric": {
        "id": "metric-uuid",
        "temperature_c": 35.0,
        "vibration_g": 0.5,
        "humidity_pct": 45.0,
        "voltage_v": 4.9
      }
    }
  ],
  "pagination": {
    "total": 5,
    "limit": 50,
    "offset": 0,
    "hasMore": false
  }
}
```

## Health Check

```bash
curl http://your-backend-url:8080/api/health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "database": {
    "connected": true,
    "stats": {
      "devices": 3,
      "metrics": 1500,
      "anomalies": 12
    }
  },
  "anomalyEngine": "isoforest"
}
```

## Socket.IO Events

### Client → Server

```javascript
// Subscribe to device updates
socket.emit('subscribe:device', 'sim-device-001');

// Unsubscribe
socket.emit('unsubscribe:device', 'sim-device-001');
```

### Server → Client

```javascript
// Listen for new metrics
socket.on('metric:new', (data) => {
  console.log('New metric:', data);
  // data: { deviceId, metric: { id, ts, temperature_c, ... } }
});

// Listen for anomalies
socket.on('anomaly:new', (data) => {
  console.log('New anomaly:', data);
  // data: { deviceId, anomaly: { id, score, type, ... } }
});

// Listen for device updates
socket.on('device:update', (data) => {
  console.log('Device updated:', data);
  // data: { deviceId, device: { id, name, location, ... } }
});
```

