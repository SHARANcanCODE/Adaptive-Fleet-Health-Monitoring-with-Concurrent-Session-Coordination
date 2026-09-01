/**
 * Tests for Median Deviation anomaly detection engine
 */

import { MedianDeviationEngine } from '../median-deviation';
import { MetricPoint } from '../engine';

describe('MedianDeviationEngine', () => {
  let engine: MedianDeviationEngine;

  beforeEach(() => {
    engine = new MedianDeviationEngine(20, 95); // Small window for testing
  });

  it('should detect anomalies in multi-dimensional space', async () => {
    const deviceId = 'test-device';
    const normalPoints: MetricPoint[] = Array(15).fill(null).map(() => ({
      temperature_c: 22.0 + Math.random() * 2,
      vibration_g: 0.02 + Math.random() * 0.01,
      humidity_pct: 45.0 + Math.random() * 2,
      voltage_v: 4.9 + Math.random() * 0.1,
    }));

    // Train with normal points
    await engine.scoreBatch(deviceId, normalPoints);

    // Add an anomalous point (all metrics are outliers)
    const anomalousPoint: MetricPoint = {
      temperature_c: 40.0, // Very high
      vibration_g: 1.0, // Very high
      humidity_pct: 90.0, // Very high
      voltage_v: 2.0, // Very low
    };

    const results = await engine.scoreBatch(deviceId, [anomalousPoint]);

    expect(results.length).toBe(1);
    // Should detect anomaly
    expect(results[0].isAnomaly).toBe(true);
    expect(results[0].score).toBeGreaterThan(0);
  });

  it('should return correct engine type', () => {
    expect(engine.getType()).toBe('median-deviation');
  });

  it('should handle empty points gracefully', async () => {
    const results = await engine.scoreBatch('test-device', []);
    expect(results).toEqual([]);
  });
});

