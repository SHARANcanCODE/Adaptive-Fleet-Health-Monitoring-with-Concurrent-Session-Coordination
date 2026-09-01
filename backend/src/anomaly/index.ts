/**
 * Anomaly Engine Factory
 * 
 * Creates and returns the appropriate anomaly detection engine
 * based on environment configuration.
 */

import { AnomalyEngine } from './engine';
import { MedianDeviationEngine } from './median-deviation';
import { ZScoreEngine } from './zscore';

export function createAnomalyEngine(): AnomalyEngine {
  const engineType = process.env.ANOMALY_ENGINE || 'median-deviation';
  const windowSize = parseInt(process.env.ANOMALY_WINDOW_SIZE || '512', 10);
  const thresholdPercentile = parseInt(process.env.ANOMALY_THRESHOLD_PERCENTILE || '95', 10);

  switch (engineType.toLowerCase()) {
    case 'median-deviation':
    case 'isoforest': // Backward compatibility
      try {
        return new MedianDeviationEngine(windowSize, thresholdPercentile);
      } catch (error) {
        console.warn('Failed to initialize Median Deviation engine, falling back to Z-Score:', error);
        return new ZScoreEngine(200, 3.0);
      }
    case 'zscore':
      return new ZScoreEngine(windowSize, 3.0);
    default:
      console.warn(`Unknown anomaly engine: ${engineType}, defaulting to zscore`);
      return new ZScoreEngine(200, 3.0);
  }
}

export { AnomalyEngine, MetricPoint, AnomalyResult } from './engine';
export { MedianDeviationEngine } from './median-deviation';
export { ZScoreEngine } from './zscore';

