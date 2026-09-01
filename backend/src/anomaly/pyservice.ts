/**
 * Python ML Service Client
 * 
 * HTTP client for communicating with the Python Isolation Forest microservice
 */

import { logger } from '../utils/logger';

export interface MetricPoint {
  ts: string;
  temperature_c: number;
  vibration_g: number;
  humidity_pct: number;
  voltage_v: number;
}

export interface ScoredPoint {
  index: number;
  score: number;
  isAnomaly: boolean;
}

export interface ScoreBatchRequest {
  deviceId: string;
  points: MetricPoint[];
}

export interface ScoreBatchResponse {
  scores: ScoredPoint[];
}

const PY_ML_URL = process.env.PY_ML_URL || 'http://ml-service:8000';
const PY_ML_TIMEOUT = parseInt(process.env.PY_ML_TIMEOUT || '5000', 10);

/**
 * Score a batch of points using the Python ML service
 */
export async function scoreBatch(
  deviceId: string,
  points: MetricPoint[]
): Promise<ScoredPoint[]> {
  const url = `${PY_ML_URL}/score-batch`;
  
  const requestBody: ScoreBatchRequest = {
    deviceId,
    points,
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PY_ML_TIMEOUT);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Python ML service error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as ScoreBatchResponse;
    return data.scores;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      logger.warn(`Python ML service timeout for device ${deviceId}`);
      throw new Error('Python ML service timeout');
    }
    logger.error(`Python ML service error for device ${deviceId}:`, error);
    throw error;
  }
}

/**
 * Check if Python ML service is healthy
 */
export async function checkHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${PY_ML_URL}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch (error) {
    logger.warn('Python ML service health check failed:', error);
    return false;
  }
}

