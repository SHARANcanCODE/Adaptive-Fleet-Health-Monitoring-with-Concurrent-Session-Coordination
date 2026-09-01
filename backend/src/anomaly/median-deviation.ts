/**
 * Median Deviation Anomaly Detection Engine
 * 
 * This engine uses a robust statistical measure (Median Absolute Deviation)
 * to detect outliers in multi-dimensional metric space.
 * 
 * Note: This was previously misleadingly named "Isolation Forest". It is a
 * lightweight, median-based distance heuristic that is efficient for 
 * edge-constrained environments but lacks the high-dimensional relational 
 * modeling of a true tree-based Isolation Forest.
 */

import { AnomalyEngine, AnomalyResult, MetricPoint } from './engine';

/**
 * Robust Median-based outlier detection
 */
class MedianDeviationModel {
  private contamination: number;

  constructor(contamination: number = 0.1) {
    this.contamination = contamination;
  }

  /**
   * Score each point based on its distance from the feature medians,
   * normalized by the Median Absolute Deviation (MAD).
   */
  score(features: number[][]): number[] {
    if (features.length === 0) return [];

    const nFeatures = features[0].length;
    const medians: number[] = [];
    const mads: number[] = [];

    // Calculate median and MAD for each feature (robust statistics)
    for (let i = 0; i < nFeatures; i++) {
      const values = features.map(f => f[i]).sort((a, b) => a - b);
      const median = values[Math.floor(values.length / 2)];
      medians.push(median);
      
      const deviations = values.map(v => Math.abs(v - median));
      deviations.sort((a, b) => a - b);
      // Use 1 as fallback for MAD to avoid division by zero
      const mad = deviations[Math.floor(deviations.length / 2)] || 1;
      mads.push(mad);
    }

    // Score each point based on aggregate normalized distance
    return features.map(point => {
      let totalDistance = 0;
      for (let i = 0; i < nFeatures; i++) {
        const normalizedDistance = Math.abs(point[i] - medians[i]) / (mads[i] || 1);
        totalDistance += normalizedDistance;
      }
      // Negative aggregate distance (lower = more anomalous)
      return -totalDistance / nFeatures;
    });
  }
}

export class MedianDeviationEngine implements AnomalyEngine {
  private models: Map<string, MedianDeviationModel> = new Map();
  private windowSize: number;
  private thresholdPercentile: number;
  private recentPoints: Map<string, MetricPoint[]> = new Map();

  constructor(windowSize: number = 512, thresholdPercentile: number = 95) {
    this.windowSize = windowSize;
    this.thresholdPercentile = thresholdPercentile;
  }

  getType(): string {
    return 'median-deviation';
  }

  async scoreBatch(deviceId: string, points: MetricPoint[]): Promise<AnomalyResult[]> {
    let devicePoints = this.recentPoints.get(deviceId) || [];

    // Add new points to window
    devicePoints.push(...points);
    
    // Keep only the most recent windowSize points
    if (devicePoints.length > this.windowSize) {
      devicePoints = devicePoints.slice(-this.windowSize);
    }
    this.recentPoints.set(deviceId, devicePoints);

    // Need at least 2 points to distinguish outliers
    if (devicePoints.length < 2) {
      return points.map((_, idx) => ({
        pointIndex: idx,
        score: 0,
        isAnomaly: false,
      }));
    }

    // Get or create model for this device
    if (!this.models.has(deviceId)) {
      this.models.set(deviceId, new MedianDeviationModel(0.1));
    }

    const model = this.models.get(deviceId)!;

    // Prepare features
    const allFeatures = devicePoints.map(p => [
      p.temperature_c,
      p.vibration_g,
      p.humidity_pct,
      p.voltage_v,
    ]);

    const newFeatures = points.map(p => [
      p.temperature_c,
      p.vibration_g,
      p.humidity_pct,
      p.voltage_v,
    ]);

    // Score window to establish threshold
    const allScores = model.score(allFeatures);
    
    // Calculate threshold from percentile
    const sortedScores = [...allScores].sort((a, b) => a - b);
    const thresholdIndex = Math.floor(
      (sortedScores.length * (100 - this.thresholdPercentile)) / 100
    );
    const threshold = sortedScores[thresholdIndex] || 0;

    // Score the specific batch
    const newScores = model.score(newFeatures);

    // Return results
    return newScores.map((score, idx) => ({
      pointIndex: idx,
      score: Math.abs(score),
      isAnomaly: score < threshold,
    }));
  }
}

