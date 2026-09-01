/**
 * Z-Score Anomaly Detection Engine
 * 
 * Uses rolling window mean and standard deviation to detect
 * anomalies based on z-score thresholds.
 */

import { AnomalyEngine, AnomalyResult, MetricPoint } from './engine';

interface DeviceStats {
  temperature: { mean: number; std: number; points: number[] };
  vibration: { mean: number; std: number; points: number[] };
  humidity: { mean: number; std: number; points: number[] };
  voltage: { mean: number; std: number; points: number[] };
}

export class ZScoreEngine implements AnomalyEngine {
  private stats: Map<string, DeviceStats> = new Map();
  private windowSize: number;
  private threshold: number;

  constructor(windowSize: number = 200, threshold: number = 3.0) {
    this.windowSize = windowSize;
    this.threshold = threshold;
  }

  getType(): string {
    return 'zscore';
  }

  private updateStats(
    deviceId: string,
    metric: 'temperature' | 'vibration' | 'humidity' | 'voltage',
    value: number
  ): void {
    if (!this.stats.has(deviceId)) {
      this.stats.set(deviceId, {
        temperature: { mean: 0, std: 1, points: [] },
        vibration: { mean: 0, std: 1, points: [] },
        humidity: { mean: 0, std: 1, points: [] },
        voltage: { mean: 0, std: 1, points: [] },
      });
    }

    const deviceStats = this.stats.get(deviceId)!;
    const stat = deviceStats[metric as keyof DeviceStats] as { mean: number; std: number; points: number[] };

    // Add point to window
    stat.points.push(value);
    if (stat.points.length > this.windowSize) {
      stat.points.shift();
    }

    // Recalculate mean and std
    const n = stat.points.length;
    if (n === 0) {
      stat.mean = value;
      stat.std = 1;
      return;
    }

    const sum = stat.points.reduce((a, b) => a + b, 0);
    stat.mean = sum / n;

    if (n === 1) {
      stat.std = 1;
    } else {
      const variance = stat.points.reduce((acc, p) => acc + Math.pow(p - stat.mean, 2), 0) / (n - 1);
      stat.std = Math.sqrt(variance) || 1; // Avoid division by zero
    }
  }

  private calculateZScore(value: number, mean: number, std: number): number {
    if (std === 0) return 0;
    return Math.abs((value - mean) / std);
  }

  async scoreBatch(deviceId: string, points: MetricPoint[]): Promise<AnomalyResult[]> {
    const results: AnomalyResult[] = [];

    for (let idx = 0; idx < points.length; idx++) {
      const point = points[idx];

      // Update statistics for each metric
      this.updateStats(deviceId, 'temperature', point.temperature_c);
      this.updateStats(deviceId, 'vibration', point.vibration_g);
      this.updateStats(deviceId, 'humidity', point.humidity_pct);
      this.updateStats(deviceId, 'voltage', point.voltage_v);

      const deviceStats = this.stats.get(deviceId)!;

      // Calculate z-scores for each metric
      const zTemp = this.calculateZScore(
        point.temperature_c,
        deviceStats.temperature.mean,
        deviceStats.temperature.std
      );
      const zVib = this.calculateZScore(
        point.vibration_g,
        deviceStats.vibration.mean,
        deviceStats.vibration.std
      );
      const zHum = this.calculateZScore(
        point.humidity_pct,
        deviceStats.humidity.mean,
        deviceStats.humidity.std
      );
      const zVolt = this.calculateZScore(
        point.voltage_v,
        deviceStats.voltage.mean,
        deviceStats.voltage.std
      );

      // Use maximum z-score as overall anomaly score
      const maxZScore = Math.max(zTemp, zVib, zHum, zVolt);
      
      // Convert to anomaly score (higher is more anomalous)
      // Use negative z-score so higher scores indicate anomalies
      const score = maxZScore;

      results.push({
        pointIndex: idx,
        score: score,
        isAnomaly: maxZScore > this.threshold,
      });
    }

    return results;
  }
}

