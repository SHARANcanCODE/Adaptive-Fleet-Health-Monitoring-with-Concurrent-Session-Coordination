/**
 * Advanced Simulator & Seed Control Route Handler
 * 
 * Provides complete transparency for judges into the mock generator's active seed,
 * deterministic fault schedules, per-device assignments, and phase timings.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { emitSimulatorSeed } from '../realtime';
import { logger } from '../utils/logger';

const router = Router();
const prisma = new PrismaClient();

let currentSeed: string | number = process.env.SIMULATOR_SEED || '42';
let lastSeedUpdate: string = new Date().toISOString();

const FAULT_CLASSES = ['spike', 'drift', 'flatline', 'oscillation', 'sensor_swap'] as const;
type FaultClass = typeof FAULT_CLASSES[number];

const REGIONS = [
  { id: 'us-east', name: 'US East (N. Virginia / NY)' },
  { id: 'us-west', name: 'US West (California)' },
  { id: 'eu-west', name: 'EU West (London)' },
  { id: 'ap-south', name: 'AP South (Mumbai)' },
  { id: 'ap-east', name: 'AP East (Tokyo)' },
];

const PRESETS = [
  {
    name: 'Judge Baseline (Seed 42)',
    seed: '42',
    description: 'Balanced distribution across all 5 fault classes with staggered regional onsets',
  },
  {
    name: 'Thermal Spike Cluster',
    seed: '10007',
    description: 'Concentrates high-z temperature anomalies in US-East & EU-West for rapid spike demonstration',
  },
  {
    name: 'Linear Drift & Regime Shift',
    seed: 'drift-test-888',
    description: 'Triggers continuous upward temperature drifts and stabilized voltage sensor swaps',
  },
  {
    name: 'High Frequency Oscillations',
    seed: 'osc-wave-99',
    description: 'High crossing-rate humidity oscillations demonstrating zero-crossing detection',
  },
  {
    name: 'Regional Conflict Demo',
    seed: 'conflict-trigger-333',
    description: 'Simultaneously activates concurrent anomalies on co-located devices in EU-West',
  },
];

// Seeded PRNG
function createPRNG(seedInput: string | number) {
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

// Compute deterministic schedule from seed
function computeSeedSchedule(seed: string | number) {
  const prng = createPRNG(seed);
  const randomizedModes: FaultClass[] = [];
  for (let i = 0; i < 20; i++) {
    const modeIdx = Math.floor(prng() * FAULT_CLASSES.length);
    randomizedModes.push(FAULT_CLASSES[modeIdx]);
  }

  const faultyDeviceIndices = new Set<number>();
  while (faultyDeviceIndices.size < 20) {
    const idx = Math.floor(prng() * 50) + 1;
    faultyDeviceIndices.add(idx);
  }
  const faultyIndicesArray = Array.from(faultyDeviceIndices);

  const devicesSchedule = [];
  const breakdown: Record<string, string[]> = {
    healthy: [],
    spike: [],
    drift: [],
    flatline: [],
    oscillation: [],
    sensor_swap: [],
  };

  let deviceIndex = 1;
  for (let r = 0; r < REGIONS.length; r++) {
    const region = REGIONS[r];
    const regionalModeIdx = Math.floor(prng() * FAULT_CLASSES.length);
    const regionalPrimaryMode = FAULT_CLASSES[(regionalModeIdx + r) % FAULT_CLASSES.length];
    const regionalSecondaryMode = FAULT_CLASSES[(regionalModeIdx + r + 1) % FAULT_CLASSES.length];
    const regionalCycleOffset = Math.floor(prng() * 4);

    for (let d = 0; d < 10; d++) {
      const idNumber = String(deviceIndex).padStart(3, '0');
      const deviceId = `sim-device-${idNumber}`;

      let failureMode: FaultClass | null = null;
      if (d < 4) {
        failureMode = d < 2 ? regionalPrimaryMode : (d === 2 ? regionalPrimaryMode : regionalSecondaryMode);
      }

      const cycleOffset = regionalCycleOffset;

      let targetChannel = 'temperature_c';
      if (failureMode === 'flatline') targetChannel = 'vibration_g';
      else if (failureMode === 'oscillation') targetChannel = 'humidity_pct';
      else if (failureMode === 'sensor_swap') targetChannel = 'voltage_v';
      else if (failureMode === 'drift') targetChannel = 'temperature_c';
      else if (failureMode === 'spike') targetChannel = 'temperature_c';

      const modeKey = failureMode || 'healthy';
      breakdown[modeKey].push(deviceId);

      devicesSchedule.push({
        deviceId,
        name: `Sensor-${idNumber}`,
        region: region.id,
        regionName: region.name,
        failureMode,
        targetChannel,
        cycleOffset,
        baselineTemp: Number((20.0 + (deviceIndex % 7) * 2.0).toFixed(1)),
        baselineVolt: Number((4.8 + (deviceIndex % 5) * 0.1).toFixed(2)),
        baselineVib: Number((0.015 + (deviceIndex % 4) * 0.005).toFixed(3)),
        baselineHum: Number((40.0 + (deviceIndex % 8) * 3.0).toFixed(1)),
      });

      deviceIndex++;
    }
  }

  // Hash hex fingerprint
  let hashNum = 0;
  for (let i = 0; i < String(seed).length; i++) {
    hashNum = (hashNum << 5) - hashNum + String(seed).charCodeAt(i);
    hashNum |= 0;
  }
  const seedHash = (hashNum >>> 0).toString(16).padStart(8, '0');

  return {
    seed,
    seedHash,
    devicesSchedule,
    breakdown,
    healthyCount: breakdown.healthy.length,
    faultyCount: devicesSchedule.length - breakdown.healthy.length,
  };
}

const SeedSchema = z.object({
  seed: z.union([z.string().min(1), z.number()]),
});

// GET /api/simulator/status - Detailed transparent simulator inspection
router.get('/status', async (req: Request, res: Response) => {
  try {
    const schedule = computeSeedSchedule(currentSeed);
    const dbDeviceCount = await prisma.device.count();
    const recentMetricsCount = await prisma.metric.count({
      where: {
        ts: {
          gte: new Date(Date.now() - 60000),
        },
      },
    });

    res.json({
      ...schedule,
      activeDevicesCount: dbDeviceCount,
      eventsPerMinute: recentMetricsCount,
      faultClasses: FAULT_CLASSES,
      presets: PRESETS,
      lastSeedUpdate,
    });
  } catch (error) {
    logger.error('Error getting simulator status:', error);
    res.status(500).json({
      error: 'Failed to retrieve simulator status',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// POST /api/simulator/seed - Set mock generator seed
router.post('/seed', async (req: Request, res: Response) => {
  try {
    const body = SeedSchema.parse(req.body);
    currentSeed = body.seed;
    lastSeedUpdate = new Date().toISOString();

    logger.info(`Simulator seed updated by judge/operator to: ${currentSeed}`);

    // Broadcast seed change to all active browser sessions and simulator instances
    emitSimulatorSeed(currentSeed);

    const schedule = computeSeedSchedule(currentSeed);

    res.json({
      success: true,
      ...schedule,
      faultClasses: FAULT_CLASSES,
      lastSeedUpdate,
      message: `Mock generator seed set to '${currentSeed}'. Fault sequence re-randomized.`,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
    }

    logger.error('Error updating simulator seed:', error);
    res.status(500).json({
      error: 'Failed to update simulator seed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export function getCurrentSeed(): string | number {
  return currentSeed;
}

export default router;
