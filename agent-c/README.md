# C MQTT Sensor Agent

Lightweight C client for publishing IoT sensor metrics via MQTT.

## Prerequisites

- CMake 3.10+
- libmosquitto-dev (or mosquitto-dev on some systems)
- pkg-config

### Installing Dependencies

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install libmosquitto-dev cmake pkg-config build-essential
```

**macOS (Homebrew):**
```bash
brew install mosquitto cmake pkg-config
```

**Alpine Linux:**
```bash
apk add mosquitto-dev cmake pkgconfig gcc musl-dev
```

## Building

```bash
cd agent-c
mkdir -p build
cd build
cmake ..
make
```

Or use the Makefile:
```bash
make build
```

## Configuration

Edit `config/agent.ini` or use CLI flags:

```ini
device_id=device-c-001
mqtt_broker_url=mqtt://localhost:1883
topic=sensors/device-c-001/metrics
interval_ms=1000
anomaly_spike_prob=0.01
```

## Running

```bash
# Default (uses config/agent.ini)
./build/agent-c

# Override with CLI flags
./build/agent-c --device_id=my-device --mqtt=mqtt://broker:1883 --interval_ms=500
```

## CLI Flags

- `--device_id=<id>` - Device identifier
- `--mqtt=<url>` - MQTT broker URL (format: `mqtt://host:port`)
- `--interval_ms=<ms>` - Publish interval in milliseconds
- `--spike_prob=<0.0-1.0>` - Probability of injecting anomaly spikes

## Output Format

Publishes JSON messages to `sensors/<deviceId>/metrics`:

```json
{
  "ts": "2025-01-11T12:00:00.000Z",
  "temperature_c": 22.3,
  "vibration_g": 0.034,
  "humidity_pct": 44.7,
  "voltage_v": 4.91
}
```

## Troubleshooting

- **"mosquitto.h: No such file"** - Install libmosquitto-dev
- **"Connection refused"** - Ensure Mosquitto broker is running and accessible
- **"Topic not found"** - Check broker configuration allows publishing

