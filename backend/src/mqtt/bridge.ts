/**
 * MQTT Bridge
 * 
 * Subscribes to MQTT topics, processes messages, and integrates with the backend
 */

import mqtt, { MqttClient } from 'mqtt';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import { scoreBatch, checkHealth } from '../anomaly/pyservice';
import { createAnomalyEngine } from '../anomaly';
import { getIOServer } from '../realtime';

const MQTT_ENABLE = process.env.MQTT_ENABLE === 'true';
const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://mosquitto:1883';
const PY_ML_ENABLE = process.env.PY_ML_ENABLE === 'true';
const ALLOW_AUTO_DEVICE = process.env.ALLOW_AUTO_DEVICE === 'true';

// Per-device batching for ML service
const BATCH_SIZE = parseInt(process.env.MQTT_BATCH_SIZE || '64', 10);
const deviceBuffers: Map<string, BufferItem[]> = new Map();

interface BufferItem {
  deviceId: string;
  metric: any; // Result of prisma.metric.create
  timestamp: Date;
}

interface MetricData {
  ts: string;
  temperature_c: number;
  vibration_g: number;
  humidity_pct: number;
  voltage_v: number;
  lat?: number;
  lng?: number;
}

let mqttClient: MqttClient | null = null;
let prisma: PrismaClient | null = null;
let socketIO: any = null;
const zScoreEngine = createAnomalyEngine();

/**
 * Initialize MQTT bridge
 */
export async function initializeMQTTBridge(
  prismaClient: PrismaClient,
  socketIOServer: any
): Promise<void> {
  if (!MQTT_ENABLE) {
    logger.info('MQTT bridge disabled (MQTT_ENABLE=false)');
    return;
  }

  prisma = prismaClient;
  socketIO = socketIOServer || getIOServer();

  logger.info(`Connecting to MQTT broker: ${MQTT_BROKER_URL}`);

  try {
    mqttClient = mqtt.connect(MQTT_BROKER_URL, {
      reconnectPeriod: 5000,
      connectTimeout: 10000,
      clientId: `iot-backend-${Date.now()}`,
    });

    mqttClient.on('connect', () => {
      logger.info('MQTT client connected');
      subscribeToTopics();
    });

    mqttClient.on('error', (error) => {
      logger.error('MQTT client error:', error);
    });

    mqttClient.on('reconnect', () => {
      logger.info('MQTT client reconnecting...');
    });

    mqttClient.on('message', async (topic, message) => {
      await handleMQTTMessage(topic, message);
    });

    mqttClient.on('close', () => {
      logger.warn('MQTT client disconnected');
    });

    // Check Python ML service health if enabled
    if (PY_ML_ENABLE) {
      const healthy = await checkHealth();
      if (!healthy) {
        logger.warn('Python ML service not available, will fallback to z-score');
      } else {
        logger.info('Python ML service is healthy');
      }
    }
  } catch (error) {
    logger.error('Failed to initialize MQTT bridge:', error);
    throw error;
  }
}

/**
 * Subscribe to MQTT topics
 */
function subscribeToTopics(): void {
  if (!mqttClient) return;

  const topic = 'sensors/+/metrics';
  mqttClient.subscribe(topic, (err) => {
    if (err) {
      logger.error(`Failed to subscribe to ${topic}:`, err);
    } else {
      logger.info(`Subscribed to MQTT topic: ${topic}`);
    }
  });
}

/**
 * Handle incoming MQTT message
 */
async function handleMQTTMessage(topic: string, message: Buffer): Promise<void> {
  try {
    // Parse topic: sensors/<deviceId>/metrics
    const topicParts = topic.split('/');
    if (topicParts.length !== 3 || topicParts[0] !== 'sensors' || topicParts[2] !== 'metrics') {
      logger.warn(`Unexpected topic format: ${topic}`);
      return;
    }

    const deviceId = topicParts[1];
    const payload = JSON.parse(message.toString()) as MetricData;

    // Validate payload
    if (!payload.ts || typeof payload.temperature_c !== 'number') {
      logger.warn(`Invalid payload from device ${deviceId}`);
      return;
    }

    logger.debug(`Received MQTT message from device ${deviceId}`);

    // Ensure device exists
    await ensureDeviceExists(deviceId, payload.lat, payload.lng);

    // Store metric
    const metric = await storeMetric(deviceId, payload);

    // Add to batch buffer for anomaly detection
    addToBatch(deviceId, metric, payload);

    // Emit real-time update
    emitMetricUpdate(deviceId, metric, payload);

    // Process batch if ready
    await processBatchIfReady(deviceId);
  } catch (error) {
    logger.error('Error handling MQTT message:', error);
  }
}

/**
 * Ensure device exists in database
 */
async function ensureDeviceExists(
  deviceId: string,
  lat?: number,
  lng?: number
): Promise<void> {
  if (!prisma) return;

  try {
    await prisma.device.upsert({
      where: { id: deviceId },
      update: {
        // Update location if provided
        ...(lat !== undefined && lng !== undefined && {
          location: `lat:${lat},lng:${lng}`,
        }),
      },
      create: {
        id: deviceId,
        name: `Device ${deviceId}`,
        location: lat !== undefined && lng !== undefined ? `lat:${lat},lng:${lng}` : null,
      },
    });
  } catch (error) {
    logger.error(`Failed to ensure device ${deviceId} exists:`, error);
    if (!ALLOW_AUTO_DEVICE) {
      throw error;
    }
  }
}

/**
 * Store metric in database
 */
async function storeMetric(deviceId: string, payload: MetricData) {
  if (!prisma) {
    throw new Error('Prisma client not initialized');
  }

  return await prisma.metric.create({
    data: {
      deviceId,
      ts: new Date(payload.ts),
      temperature_c: payload.temperature_c,
      vibration_g: payload.vibration_g,
      humidity_pct: payload.humidity_pct,
      voltage_v: payload.voltage_v,
    },
  });
}

/**
 * Add metric to batch buffer
 */
function addToBatch(deviceId: string, metric: any, payload: MetricData): void {
  if (!deviceBuffers.has(deviceId)) {
    deviceBuffers.set(deviceId, []);
  }

  const buffer = deviceBuffers.get(deviceId)!;
  buffer.push({
    deviceId,
    metric,
    timestamp: new Date(),
  });

  // Keep buffer size reasonable
  if (buffer.length > BATCH_SIZE * 2) {
    buffer.shift();
  }
}

/**
 * Process batch if ready
 */
async function processBatchIfReady(deviceId: string): Promise<void> {
  const buffer = deviceBuffers.get(deviceId);
  if (!buffer || buffer.length < BATCH_SIZE) {
    return;
  }

  // Extract batch
  const batch = buffer.splice(0, BATCH_SIZE);
  const points = batch.map((item) => ({
    temperature_c: item.metric.temperature_c,
    vibration_g: item.metric.vibration_g,
    humidity_pct: item.metric.humidity_pct,
    voltage_v: item.metric.voltage_v,
  }));

  try {
    let scoredPoints: Array<{ index: number; score: number; isAnomaly: boolean }> = [];

    if (PY_ML_ENABLE) {
      // Use Python ML service (needs ts field)
      try {
        const pointsWithTs = batch.map((item) => ({
          ts: item.metric.ts.toISOString(),
          temperature_c: item.metric.temperature_c,
          vibration_g: item.metric.vibration_g,
          humidity_pct: item.metric.humidity_pct,
          voltage_v: item.metric.voltage_v,
        }));
        scoredPoints = await scoreBatch(deviceId, pointsWithTs);
      } catch (error) {
        logger.warn(`Python ML service failed, falling back to z-score:`, error);
        // Fallback to z-score
        const zScoreResults = await zScoreEngine.scoreBatch(deviceId, points);
        scoredPoints = zScoreResults.map((r, idx) => ({
          index: idx,
          score: r.score,
          isAnomaly: r.isAnomaly,
        }));
      }
    } else {
      // Use z-score engine directly
      const zScoreResults = await zScoreEngine.scoreBatch(deviceId, points);
      scoredPoints = zScoreResults.map((r, idx) => ({
        index: idx,
        score: r.score,
        isAnomaly: r.isAnomaly,
      }));
    }

    if (scoredPoints.length > 0) {
      await storeAnomalies(deviceId, batch, scoredPoints);
    }
  } catch (error) {
    logger.error(`Error processing batch for device ${deviceId}:`, error);
  }
}

/**
 * Store anomalies in database
 */
async function storeAnomalies(
  deviceId: string,
  batch: BufferItem[],
  scoredPoints: Array<{ index: number; score: number; isAnomaly: boolean }>
): Promise<void> {
  if (!prisma) return;

  const anomalies = scoredPoints
    .filter((s) => s.isAnomaly)
    .map((s) => {
      const item = batch[s.index];
      return {
        deviceId,
        metricId: item.metric.id,
        ts: item.metric.ts,
        score: s.score,
        type: PY_ML_ENABLE ? 'isoforest' : 'median-deviation',
        flagged: true,
      };
    });

  if (anomalies.length > 0) {
    await prisma.anomaly.createMany({
      data: anomalies,
      skipDuplicates: true,
    });

    // Emit anomaly events
    anomalies.forEach((anomaly) => {
      emitAnomalyUpdate(deviceId, anomaly);
    });

    logger.info(`Stored ${anomalies.length} anomalies for device ${deviceId}`);
  }
}

/**
 * Emit metric update via Socket.IO
 */
function emitMetricUpdate(deviceId: string, metric: any, payload: MetricData): void {
  if (!socketIO) return;

  socketIO.emit('metric:new', {
    deviceId,
    metric: {
      id: metric.id,
      ts: metric.ts,
      temperature_c: metric.temperature_c,
      vibration_g: metric.vibration_g,
      humidity_pct: metric.humidity_pct,
      voltage_v: metric.voltage_v,
    },
  });
}

/**
 * Emit anomaly update via Socket.IO
 */
function emitAnomalyUpdate(deviceId: string, anomaly: any): void {
  if (!socketIO) return;

  socketIO.emit('anomaly:new', {
    deviceId,
    anomaly: {
      id: anomaly.id || 'pending',
      ts: anomaly.ts,
      score: anomaly.score,
      type: anomaly.type,
      flagged: anomaly.flagged,
    },
  });
}

/**
 * Shutdown MQTT bridge
 */
export async function shutdownMQTTBridge(): Promise<void> {
  if (mqttClient) {
    mqttClient.end();
    mqttClient = null;
    logger.info('MQTT bridge shut down');
  }
}

