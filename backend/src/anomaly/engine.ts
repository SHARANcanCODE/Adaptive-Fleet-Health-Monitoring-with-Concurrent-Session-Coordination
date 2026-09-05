/**
 * Anomaly Detection Engine Interface
 * 
 * All anomaly detection engines must implement this interface
 * to be pluggable into the system.
 */

export interface MetricPoint {
  temperature_c: number;
  vibration_g: number;
  humidity_pct: number;
  voltage_v: number;
}

export interface AnomalyResult {
  pointIndex: number;
  score: number;
  isAnomaly: boolean;
  // Failure-mode classification, when the engine supports it (adaptive-baseline does).
  failureType?: 'spike' | 'drift' | 'flatline' | 'oscillation' | 'sensor_swap';
  // Which metric channel triggered the classification.
  metric?: 'temperature_c' | 'vibration_g' | 'humidity_pct' | 'voltage_v';
}

export interface AnomalyEngine {
  /**
   * Score a batch of metrics and return anomaly results
   * @param deviceId - Device identifier
   * @param points - Array of metric points to score
   * @returns Array of anomaly results, one per input point
   */
  scoreBatch(deviceId: string, points: MetricPoint[]): Promise<AnomalyResult[]>;
  
  /**
   * Get the engine type name
   */
  getType(): string;
}

