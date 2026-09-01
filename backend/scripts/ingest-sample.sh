#!/bin/bash
# Sample script to ingest metrics via curl

API_URL="${API_URL:-http://localhost:8080}"

curl -X POST "${API_URL}/api/ingest" \
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

echo ""

