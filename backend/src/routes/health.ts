/**
 * Health Check Route
 * 
 * Returns API health status and database connectivity
 */

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

router.get('/', async (req: Request, res: Response) => {
  try {
    // Check database connectivity
    await prisma.$queryRaw`SELECT 1`;

    const [deviceCount, metricCount, anomalyCount] = await Promise.all([
      prisma.device.count(),
      prisma.metric.count(),
      prisma.anomaly.count(),
    ]);

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: {
        connected: true,
        stats: {
          devices: deviceCount,
          metrics: metricCount,
          anomalies: anomalyCount,
        },
      },
      anomalyEngine: process.env.ANOMALY_ENGINE || 'isoforest',
    });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      database: {
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
});

export default router;

