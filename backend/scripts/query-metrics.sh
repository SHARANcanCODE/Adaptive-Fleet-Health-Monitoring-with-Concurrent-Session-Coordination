#!/bin/bash
# Sample script to query metrics

API_URL="${API_URL:-http://localhost:8080}"
DEVICE_ID="${DEVICE_ID:-sim-device-001}"
LIMIT="${LIMIT:-10}"

curl -X GET "${API_URL}/api/metrics?deviceId=${DEVICE_ID}&limit=${LIMIT}" \
  -H "Content-Type: application/json" | jq '.'

echo ""

