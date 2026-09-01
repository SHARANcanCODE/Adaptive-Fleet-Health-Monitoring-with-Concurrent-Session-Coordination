/**
 * Tests for Z-Score anomaly detection engine
 */

import { ZScoreEngine } from '../zscore';
import { MetricPoint } from '../engine';

describe('ZScoreEngine', () => {
  let engine: ZScoreEngine;

  beforeEach(() => {
    engine = new ZScoreEngine(10, 3.0); // Small window for testing
  });

  it('should detect anomalies when z-score exceeds threshold', async () => {
    const deviceId = 'test-device';
    const normalPoints: MetricPoint[] = Array(10).fill(null).map(() => ({
      temperature_c: 22.0,
      vibration_g: 0.02,
      humidity_pct: 45.0,
      voltage_v: 4.9,
    }));

    // Train with normal points
    await engine.scoreBatch(deviceId, normalPoints);

    // Add an anomalous point
    const anomalousPoint: MetricPoint = {
      temperature_c: 35.0, // Much higher than normal
      vibration_g: 0.02,
      humidity_pct: 45.0,
      voltage_v: 4.9,
    };

    const results = await engine.scoreBatch(deviceId, [anomalousPoint]);

    expect(results.length).toBe(1);
    expect(results[0].isAnomaly).toBe(true);
    expect(results[0].score).toBeGreaterThan(3.0);
  });

  it('should not flag normal points as anomalies', async () => {
    const deviceId = 'test-device';
    const normalPoints: MetricPoint[] = Array(15).fill(null).map(() => ({
      temperature_c: 22.0 + Math.random() * 2, // Small variation
      vibration_g: 0.02 + Math.random() * 0.01,
      humidity_pct: 45.0 + Math.random() * 2,
      voltage_v: 4.9 + Math.random() * 0.1,
    }));

    const results = await engine.scoreBatch(deviceId, normalPoints);

    // Most points should not be anomalies
    const anomalyCount = results.filter(r => r.isAnomaly).length;
    expect(anomalyCount).toBeLessThan(normalPoints.length / 2);
  });

  it('should return correct engine type', () => {
    expect(engine.getType()).toBe('zscore');
  });
});

