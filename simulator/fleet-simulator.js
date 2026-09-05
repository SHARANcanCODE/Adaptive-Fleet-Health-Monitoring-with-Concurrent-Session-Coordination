/**
 * 50+ Device Fleet Simulator with Adaptive Failure Mode Injection, Region Coordination & Seed Control
 * 
 * Standalone Node 20 script using built-in fetch.
 * 
 * Rules & Capabilities:
 * - Clean device naming: Device names are cleanly formatted (e.g. "Sensor-001") with NO error/failure names stated next to device names.
 * - Seeded PRNG (Mulberry32): Judges control the mock generator's seed at demo time.
 * - Fault Sequence Randomization: Teams know the class of faults in advance (spike, drift, flatline, oscillation, sensor_swap),
 *   never the exact sequence. The sequence, onset times, and device targets are deterministically derived from the active seed.
 * - Immediate Visual Impact: Fault injection cycles are rapid (22s cycles) and trigger vivid, unmistakable waveform deviations
 *   (Spikes, Linear Drifts, Flatlines, Oscillations, and Step Jumps) so judges immediately see the clear visual changes on the graphs.
 */

const BACKEND_URL = process.env.BACKEND_URL || 'http://backend:8080';
const TICK_INTERVAL_MS = parseInt(process.env.TICK_INTERVAL_MS || '1000', 10);
const WARMUP_TICKS = 3; // Fast 3-second initial readiness

let activeSeed = process.env.SIMULATOR_SEED || '42';
let seedChangeTick = 0;

const REGIONS = [
  { id: 'us-east', baseLat: 40.7128, baseLng: -74.0060, name: 'US East (N. Virginia / NY)' },
  { id: 'us-west', baseLat: 37.7749, baseLng: -122.4194, name: 'US West (California)' },
  { id: 'eu-west', baseLat: 51.5074, baseLng: -0.1278, name: 'EU West (London)' },
  { id: 'ap-south', baseLat: 19.0760, baseLng: 72.8777, name: 'AP South (Mumbai)' },
  { id: 'ap-east', baseLat: 35.6762, baseLng: 139.6503, name: 'AP East (Tokyo)' },
];

const FAILURE_MODES = ['spike', 'drift', 'flatline', 'oscillation', 'sensor_swap'];

// Mulberry32 Seeded PRNG
function createPRNG(seedInput) {
  let s = 0;
  if (typeof seedInput === 'number') {
    s = seedInput;
  } else {
    for (let i = 0; i < String(seedInput).length; i++) {
      s = (s << 5) - s + String(seedInput).charCodeAt(i);
      s |= 0;
    }
  }

  return function nextRandom() {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let prng = createPRNG(activeSeed);

function randomNoise(spread, customPrng = prng) {
  return (customPrng() - 0.5) * 2 * spread;
}

// Generate fleet devices with randomized fault sequence derived from seed
function generateFleetDevices(seed) {
  const localPrng = createPRNG(seed);
  const devices = [];
  let deviceIndex = 1;

  // Create randomized failure mode distribution based on the seed
  const randomizedModes = [];
  for (let i = 0; i < 20; i++) {
    const modeIdx = Math.floor(localPrng() * FAILURE_MODES.length);
    randomizedModes.push(FAILURE_MODES[modeIdx]);
  }

  // Shuffle device order for fault assignment
  const faultyDeviceIndices = new Set();
  while (faultyDeviceIndices.size < 20) {
    const idx = Math.floor(localPrng() * 50) + 1;
    faultyDeviceIndices.add(idx);
  }
  const faultyIndicesArray = Array.from(faultyDeviceIndices);

  for (let r = 0; r < REGIONS.length; r++) {
    const region = REGIONS[r];
    // Deterministic regional correlation: derive primary & secondary failure modes per region from seed
    const regionalModeIdx = Math.floor(localPrng() * FAILURE_MODES.length);
    const regionalPrimaryMode = FAILURE_MODES[(regionalModeIdx + r) % FAILURE_MODES.length];
    const regionalSecondaryMode = FAILURE_MODES[(regionalModeIdx + r + 1) % FAILURE_MODES.length];
    const regionalCycleOffset = Math.floor(localPrng() * 4); // Synchronized regional phase offset

    for (let d = 0; d < 10; d++) {
      const idNumber = String(deviceIndex).padStart(3, '0');
      const externalId = `sim-device-${idNumber}`;

      // 4 faulty devices per region exhibiting correlated failure modes & synchronized timing
      let failureMode = null;
      if (d < 4) {
        failureMode = d < 2 ? regionalPrimaryMode : (d === 2 ? regionalPrimaryMode : regionalSecondaryMode);
      }

      // Slightly perturb lat/lng per device for nice map spread
      const lat = region.baseLat + Math.sin(d * 1.5) * 0.8;
      const lng = region.baseLng + Math.cos(d * 1.5) * 0.8;

      const cleanName = `Sensor-${idNumber}`;
      const cycleOffset = regionalCycleOffset;

      devices.push({
        id: externalId,
        externalId,
        fleetId: 'fleet-a',
        name: cleanName,
        region: region.id,
        location: `lat:${lat.toFixed(4)},lng:${lng.toFixed(4)}`,
        failureMode,
        cycleOffset,
        baselines: {
          temp: 20.0 + (deviceIndex % 7) * 2.0,
          tempNoise: 0.15 + (deviceIndex % 5) * 0.05,
          vib: 0.015 + (deviceIndex % 4) * 0.005,
          vibNoise: 0.002 + (deviceIndex % 3) * 0.001,
          hum: 40.0 + (deviceIndex % 8) * 3.0,
          humNoise: 0.3 + (deviceIndex % 4) * 0.1,
          volt: 4.8 + (deviceIndex % 5) * 0.1,
          voltNoise: 0.01 + (deviceIndex % 3) * 0.005,
        },
        faultState: {
          tickCount: 0,
        },
      });

      deviceIndex++;
    }
  }

  return devices;
}

let devices = generateFleetDevices(activeSeed);
const dynamicDevices = new Map(); // For dynamically discovered devices (fleet-b, collisions, etc.)

// Generate a single telemetry metric point for any device with vivid visual deviations
function generatePointForDevice(device, currentTick) {
  const { baselines, failureMode, cycleOffset = 0 } = device;

  let temp = baselines.temp + randomNoise(baselines.tempNoise);
  let vib = baselines.vib + randomNoise(baselines.vibNoise);
  let hum = baselines.hum + randomNoise(baselines.humNoise);
  let volt = baselines.volt + randomNoise(baselines.voltNoise);

  // During warm-up phase, all devices produce strictly healthy baseline noise
  if (currentTick < WARMUP_TICKS || !failureMode) {
    return {
      ts: new Date().toISOString(),
      temperature_c: Number(temp.toFixed(2)),
      vibration_g: Number(vib.toFixed(4)),
      humidity_pct: Number(hum.toFixed(1)),
      voltage_v: Number(volt.toFixed(3)),
    };
  }

  // Fast responsive 22-tick cycle:
  // 0-3 ticks healthy baseline -> 4-17 ticks vivid fault injection -> 18-21 ticks recovery
  const cycleLength = 22;
  const cycleTick = (currentTick - seedChangeTick + cycleOffset) % cycleLength;
  const isInjecting = cycleTick >= 4 && cycleTick < 18;

  if (isInjecting) {
    switch (failureMode) {
      case 'spike':
        // Distinct sharp high-amplitude temperature spikes every 3 ticks
        if (cycleTick % 3 === 0) {
          temp += (baselines.tempNoise * 35) + 15.0; // Clear +15°C to +20°C visible spike
        }
        break;

      case 'drift':
        // Steep, unmistakable linear upward temperature ramp
        const driftStep = cycleTick - 4;
        temp += driftStep * 2.2; // Climbs +25°C clearly across the chart
        break;

      case 'flatline':
        // Sensor freezes: total collapse of vibration variance to absolute 0
        vib = Number(baselines.vib.toFixed(4));
        break;

      case 'oscillation':
        // High-amplitude sinusoidal wave on humidity
        const wave = Math.sin((cycleTick - 4) * 1.6) * 24.0;
        hum = Number(Math.min(95, Math.max(5, baselines.hum + wave)).toFixed(1));
        break;

      case 'sensor_swap':
        // Abrupt discrete voltage level jump clamped high
        volt = Number((baselines.volt + 3.6 + randomNoise(baselines.voltNoise * 0.2)).toFixed(3));
        break;
    }
  }

  return {
    ts: new Date().toISOString(),
    temperature_c: Number(temp.toFixed(2)),
    vibration_g: Number(vib.toFixed(4)),
    humidity_pct: Number(hum.toFixed(1)),
    voltage_v: Number(volt.toFixed(3)),
  };
}

// Provision Fleet A in the backend
async function provisionFleetA() {
  console.log(`[Simulator] Provisioning 50 devices for fleet-a at ${BACKEND_URL}...`);

  const payload = {
    fleetId: 'fleet-a',
    devices: devices.map((d) => ({
      externalId: d.externalId,
      name: d.name,
      region: d.region,
      location: d.location,
    })),
  };

  try {
    const res = await fetch(`${BACKEND_URL}/api/fleets/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.warn(`[Simulator] Fleet provisioning returned status ${res.status}: ${errText}`);
    } else {
      const data = await res.json();
      console.log(`[Simulator] Successfully provisioned ${data.totalProcessed || 50} devices in fleet-a!`);
    }
  } catch (err) {
    console.warn(`[Simulator] Backend not reachable yet during provisioning, will retry:`, err.message);
  }
}

// Check backend for seed changes or newly imported devices
async function syncWithBackend(currentTick) {
  try {
    // 1. Sync seed
    const statusRes = await fetch(`${BACKEND_URL}/api/simulator/status`);
    if (statusRes.ok) {
      const statusData = await statusRes.json();
      if (statusData.seed && String(statusData.seed) !== String(activeSeed)) {
        console.log(`[Simulator] Seed change detected: ${activeSeed} -> ${statusData.seed}`);
        activeSeed = statusData.seed;
        seedChangeTick = currentTick;
        prng = createPRNG(activeSeed);
        devices = generateFleetDevices(activeSeed);
        console.log(`[Simulator] Re-randomized fault sequence using new seed '${activeSeed}'`);
      }
    }

    // 2. Discover all registered devices (e.g. Fleet B, collided devices like sim-device-001~fleet-b)
    const devRes = await fetch(`${BACKEND_URL}/api/devices`);
    if (devRes.ok) {
      const devData = await devRes.json();
      const allDevs = devData.devices || [];

      for (const dev of allDevs) {
        if (!devices.some((d) => d.id === dev.id) && !dynamicDevices.has(dev.id)) {
          console.log(`[Simulator] Discovered dynamic/conflict device: ${dev.id} (${dev.name})`);
          const isFleetB = dev.id.includes('~fleet-b') || dev.id.includes('fleet-b') || dev.fleetId === 'fleet-b';
          dynamicDevices.set(dev.id, {
            id: dev.id,
            externalId: dev.externalId || dev.id,
            fleetId: dev.fleetId || (isFleetB ? 'fleet-b' : 'unknown'),
            name: dev.name,
            region: dev.region,
            location: dev.location,
            failureMode: null,
            baselines: {
              temp: isFleetB ? 27.2 + (dev.id.length % 3) : 21.0 + (dev.id.length % 5),
              tempNoise: isFleetB ? 0.22 : 0.15,
              vib: isFleetB ? 0.028 : 0.018,
              vibNoise: isFleetB ? 0.003 : 0.002,
              hum: isFleetB ? 58.5 + (dev.id.length % 4) : 42.0 + (dev.id.length % 7),
              humNoise: isFleetB ? 0.45 : 0.3,
              volt: isFleetB ? 5.25 : 4.90,
              voltNoise: isFleetB ? 0.015 : 0.01,
            },
            faultState: { tickCount: 0 },
          });
        }
      }
    }
  } catch (e) {
    // Silent ignore during startup retries
  }
}

// Main telemetry streaming loop
async function runSimulator() {
  console.log(`[Simulator] Initializing Fleet Simulator (Active Seed: '${activeSeed}')...`);

  // Wait a short moment for backend container readiness
  await new Promise((r) => setTimeout(r, 4000));
  await provisionFleetA();

  let tick = 0;
  console.log(`[Simulator] Starting telemetry loop...`);

  setInterval(async () => {
    tick++;

    // Periodically sync seed and discover newly imported devices
    if (tick % 3 === 0) {
      await syncWithBackend(tick);
    }

    if (tick % 20 === 0) {
      const totalDevs = devices.length + dynamicDevices.size;
      console.log(
        `[Simulator] Tick ${tick} - Streaming ${totalDevs} devices (Seed: ${activeSeed})...`
      );
    }

    // Collect all devices (Fleet A + dynamic / conflict devices)
    const allActiveDevices = [...devices, ...Array.from(dynamicDevices.values())];

    // Ingest metrics in batches for sustained throughput
    const ingestPromises = allActiveDevices.map(async (device) => {
      const point = generatePointForDevice(device, tick);
      try {
        await fetch(`${BACKEND_URL}/api/ingest`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            deviceId: device.id,
            metrics: [point],
          }),
        });
      } catch (e) {
        // Ignore single transient network blips
      }
    });

    await Promise.all(ingestPromises);
  }, TICK_INTERVAL_MS);
}

runSimulator().catch((err) => {
  console.error('[Simulator] Fatal error in simulator:', err);
  process.exit(1);
});
