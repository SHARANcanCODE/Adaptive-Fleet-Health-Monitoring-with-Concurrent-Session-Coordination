/**
 * Ingest Route Handler
 * 
 * Handles POST /api/ingest for receiving metrics from IoT devices
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { PrismaClient } from '@prisma/client';
import { createAnomalyEngine } from '../anomaly';
import { checkAndRecordConflict } from '../anomaly/conflicts';
import { emitMetricNew, emitAnomalyNew } from '../realtime';
import { apiKeyAuth } from '../middleware/auth';
import { logger } from '../utils/logger';

const router = Router();
const prisma = new PrismaClient();
const anomalyEngine = createAnomalyEngine();

// Rate limiting for ingest: configurable via env, defaults to 10000 requests/minute per IP
// to comfortably support high-frequency simulator fleets without dropping requests.
const ingestLimiter = rateLimit({
  windowMs: Number(process.env.INGEST_RATE_LIMIT_WINDOW_MS) || 60 * 1000,
  max: Number(process.env.INGEST_RATE_LIMIT_MAX) || 10000,
  message: { error: 'Too many requests', message: 'Rate limit exceeded for ingest' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(ingestLimiter);
router.use(apiKeyAuth);

// Validation schema
const MetricSchema = z.object({
  ts: z.string().datetime().optional(),
  temperature_c: z.number(),
  vibration_g: z.number(),
  humidity_pct: z.number(),
  voltage_v: z.number(),
});

const IngestSchema = z.object({
  deviceId: z.string(),
  metrics: z.array(MetricSchema).min(1),
});

router.post('/', async (req: Request, res: Response) => {
  try {
    logger.debug('Received ingest request', { body: req.body });

    // Validate request body
    const body = IngestSchema.parse(req.body);
    const { deviceId, metrics } = body;

    logger.info(`Ingesting ${metrics.length} metrics for device ${deviceId}`);

    // Check if device exists, create if allowed
    let device = await prisma.device.findUnique({
      where: { id: deviceId },
    });

    if (!device) {
      const allowAutoDevice = process.env.ALLOW_AUTO_DEVICE === 'true';
      if (!allowAutoDevice) {
        return res.status(404).json({
          error: 'Device not found',
          deviceId,
        });
      }

      // Auto-create device. Devices that arrive via raw ingest (rather than
      // through the fleet-import provisioning flow) default to fleet-a with
      // their externalId equal to their id, and no region.
      device = await prisma.device.create({
        data: {
          id: deviceId,
          externalId: deviceId,
          name: `Device ${deviceId}`,
          location: null,
        },
      });
    }

    // Prepare metrics for insertion
    const now = new Date();
    const metricsToInsert = metrics.map((m) => ({
      deviceId,
      ts: m.ts ? new Date(m.ts) : now,
      temperature_c: m.temperature_c,
      vibration_g: m.vibration_g,
      humidity_pct: m.humidity_pct,
      voltage_v: m.voltage_v,
    }));

    // Insert metrics in batch
    const insertedMetrics = await prisma.metric.createManyAndReturn({
      data: metricsToInsert,
    });

    // Run anomaly detection
    const anomalyResults = await anomalyEngine.scoreBatch(
      deviceId,
      metrics.map((m) => ({
        temperature_c: m.temperature_c,
        vibration_g: m.vibration_g,
        humidity_pct: m.humidity_pct,
        voltage_v: m.voltage_v,
      }))
    );

    // Create anomaly records for flagged points
    const anomaliesToInsert = anomalyResults
      .filter((result) => result.isAnomaly)
      .map((result) => ({
        deviceId,
        metricId: insertedMetrics[result.pointIndex]?.id || null,
        ts: insertedMetrics[result.pointIndex]?.ts || now,
        score: result.score,
        type: result.failureType || anomalyEngine.getType(),
        metricChannel: result.metric || null,
        engine: anomalyEngine.getType(),
        flagged: true,
      }));

    let insertedAnomalies: any[] = [];
    if (anomaliesToInsert.length > 0) {
      insertedAnomalies = await prisma.anomaly.createManyAndReturn({
        data: anomaliesToInsert,
      });

      // Check for region-wide concurrent anomalies across devices
      await checkAndRecordConflict(prisma, deviceId, device.region);
    }

    // Emit real-time events
    for (const metric of insertedMetrics) {
      emitMetricNew(deviceId, metric);
    }

    for (const anomaly of insertedAnomalies) {
      emitAnomalyNew(deviceId, anomaly);
    }

    logger.info(`Ingest complete: ${insertedMetrics.length} metrics, ${insertedAnomalies.length} anomalies`);

    // Return response
    res.status(201).json({
      success: true,
      metricsInserted: insertedMetrics.length,
      anomaliesDetected: insertedAnomalies.length,
      deviceId,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn('Validation error in ingest', { errors: error.errors });
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
    }

    logger.error('Ingest error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
