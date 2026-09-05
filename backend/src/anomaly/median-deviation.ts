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
  private medians: number[] = [];
  private mads: number[] = [];

  constructor(contamination: number = 0.1) {
    this.contamination = contamination;
  }

  /**
   * Fit the model's medians and MADs from a window of features.
   * Must be called before score() so new points are compared against
   * the established window statistics rather than their own.
   */
  fit(features: number[][]): void {
    if (features.length === 0) return;

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

    this.medians = medians;
    this.mads = mads;
  }

  /**
   * Score each point based on its distance from the fitted feature medians,
   * normalized by the fitted Median Absolute Deviation (MAD).
   */
  score(features: number[][]): number[] {
    if (features.length === 0) return [];
    if (this.medians.length === 0) {
      // Not fitted yet - fall back to fitting on this batch
      this.fit(features);
    }

    const nFeatures = this.medians.length;

    // Score each point based on aggregate normalized distance
    return features.map(point => {
      let totalDistance = 0;
      for (let i = 0; i < nFeatures; i++) {
        const normalizedDistance = Math.abs(point[i] - this.medians[i]) / (this.mads[i] || 1);
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

    // Fit the model on the full window, then score the window to establish
    // a threshold. The new batch is scored against these same fitted stats
    // (rather than against itself), so a single-point batch can still be
    // correctly compared to the historical window.
    model.fit(allFeatures);
    const allScores = model.score(allFeatures);

    // Calculate threshold from percentile
    const sortedScores = [...allScores].sort((a, b) => a - b);
    const thresholdIndex = Math.floor(
      (sortedScores.length * (100 - this.thresholdPercentile)) / 100
    );
    const threshold = sortedScores[thresholdIndex] || 0;

    // Score the specific batch against the fitted window stats
    const newScores = model.score(newFeatures);

    // Return results. Use <= so a point sitting exactly at the percentile
    // boundary (common with small windows, where it IS the extreme value
    // used to derive the threshold) is still correctly flagged.
    return newScores.map((score, idx) => ({
      pointIndex: idx,
      score: Math.abs(score),
      isAnomaly: score <= threshold,
    }));
  }
}

