/**
 * Tests for the Adaptive Baseline failure classifier.
 *
 * Each test builds a synthetic per-device series that mimics one injected
 * failure mode, using values scaled relative to that device's own noise
 * level (never a fixed global number) so the tests double as a check that
 * detection is genuinely baseline-relative.
 */

import { AdaptiveBaselineClassifier } from '../classifier';
import { MetricPoint } from '../engine';

// Deterministic seeded PRNG (LCG) so noise looks realistic (no artificial
// alternating pattern that could itself resemble oscillation) but tests are
// 100% reproducible across runs - no flakiness from Math.random().
let rngState = 42;
function seededRandom(): number {
  rngState = (rngState * 1664525 + 1013904223) % 4294967296;
  return rngState / 4294967296;
}

function normalPoint(overrides: Partial<MetricPoint> = {}): MetricPoint {
  return {
    temperature_c: 22.0 + (seededRandom() - 0.5) * 0.4,
    vibration_g: 0.02 + (seededRandom() - 0.5) * 0.006,
    humidity_pct: 45.0 + (seededRandom() - 0.5) * 0.4,
    voltage_v: 4.9 + (seededRandom() - 0.5) * 0.02,
    ...overrides,
  };
}

async function warmUp(engine: AdaptiveBaselineClassifier, deviceId: string, count = 60) {
  for (let i = 0; i < count; i++) {
    await engine.scoreBatch(deviceId, [normalPoint()]);
  }
}

describe('AdaptiveBaselineClassifier', () => {
  let engine: AdaptiveBaselineClassifier;

  beforeEach(() => {
    rngState = 42;
    engine = new AdaptiveBaselineClassifier();
  });

  it('does not flag healthy noise as anomalous', async () => {
    await warmUp(engine, 'healthy-device', 80);
    let anomalyCount = 0;
    for (let i = 0; i < 20; i++) {
      const [result] = await engine.scoreBatch('healthy-device', [normalPoint()]);
      if (result.isAnomaly) anomalyCount++;
    }
    expect(anomalyCount).toBe(0);
  });

  it('classifies an isolated large deviation as spike', async () => {
    const deviceId = 'spike-device';
    await warmUp(engine, deviceId);

    const [result] = await engine.scoreBatch(deviceId, [
      normalPoint({ temperature_c: 45.0 }),
    ]);

    expect(result.isAnomaly).toBe(true);
    expect(result.failureType).toBe('spike');
    expect(result.metric).toBe('temperature_c');

    // Should recover to normal immediately after
    const [after] = await engine.scoreBatch(deviceId, [normalPoint()]);
    expect(after.isAnomaly).toBe(false);
  });

  it('classifies a sustained near-zero-variance run as flatline', async () => {
    const deviceId = 'flatline-device';
    await warmUp(engine, deviceId);

    let results: any[] = [];
    for (let i = 0; i < 10; i++) {
      results = await engine.scoreBatch(deviceId, [
        normalPoint({ vibration_g: 0.02 }), // exact constant value, no noise
      ]);
    }

    expect(results[0].isAnomaly).toBe(true);
    expect(results[0].failureType).toBe('flatline');
  });

  it('classifies rapid up/down flapping as oscillation', async () => {
    const deviceId = 'oscillation-device';
    await warmUp(engine, deviceId);

    let results: any[] = [];
    for (let i = 0; i < 10; i++) {
      const high = i % 2 === 0;
      results = await engine.scoreBatch(deviceId, [
        normalPoint({ humidity_pct: high ? 55.0 : 35.0 }),
      ]);
    }

    expect(results[0].isAnomaly).toBe(true);
    expect(results[0].failureType).toBe('oscillation');
  });

  it('classifies a gradual sustained shift as drift', async () => {
    const deviceId = 'drift-device';
    await warmUp(engine, deviceId);

    let results: any[] = [];
    for (let i = 1; i <= 10; i++) {
      results = await engine.scoreBatch(deviceId, [
        normalPoint({ temperature_c: 22.0 + i * 0.6 }),
      ]);
    }

    expect(results[0].isAnomaly).toBe(true);
    expect(results[0].failureType).toBe('drift');
  });

  it('classifies an abrupt jump to a new stable regime as sensor swap', async () => {
    const deviceId = 'swap-device';
    await warmUp(engine, deviceId);

    // Jump straight to a new, stable value regime (no noise/reversion)
    let results: any[] = [];
    for (let i = 0; i < 10; i++) {
      results = await engine.scoreBatch(deviceId, [
        normalPoint({ voltage_v: 8.5 }),
      ]);
    }

    expect(results[0].isAnomaly).toBe(true);
    expect(results[0].failureType).toBe('sensor_swap');
  });

  it('scales detection to each device\'s own noise level independently', async () => {
    // A naturally noisier device should not be flagged for variance that
    // would be anomalous on a quieter device, proving there's no shared
    // global threshold.
    const quietDevice = 'quiet-device';
    const noisyDevice = 'noisy-device';

    for (let i = 0; i < 80; i++) {
      await engine.scoreBatch(quietDevice, [normalPoint({ temperature_c: 22.0 + (seededRandom() - 0.5) * 0.2 })]);
      await engine.scoreBatch(noisyDevice, [normalPoint({ temperature_c: 22.0 + (seededRandom() - 0.5) * 3.0 })]);
    }

    // A moderate deviation that would be a spike for the quiet device...
    const [quietResult] = await engine.scoreBatch(quietDevice, [normalPoint({ temperature_c: 24.5 })]);
    // ...is well within the noisy device's own established range.
    const [noisyResult] = await engine.scoreBatch(noisyDevice, [normalPoint({ temperature_c: 24.5 })]);

    expect(quietResult.isAnomaly).toBe(true);
    expect(noisyResult.isAnomaly).toBe(false);
  });

  it('returns correct engine type', () => {
    expect(engine.getType()).toBe('adaptive-baseline');
  });
});
