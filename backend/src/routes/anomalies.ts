/**
 * Anomalies Route Handler
 * 
 * Handles querying anomalies with filters
 */

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// GET /api/anomalies - Query anomalies with filters
router.get('/', async (req: Request, res: Response) => {
  try {
    const {
      deviceId,
      from,
      to,
      type,
      flagged,
      limit = '1000',
      offset = '0',
    } = req.query;

    const where: any = {};

    if (deviceId) {
      where.deviceId = deviceId as string;
    }

    if (type) {
      where.type = type as string;
    }

    if (flagged !== undefined) {
      where.flagged = flagged === 'true';
    }

    if (from || to) {
      where.ts = {};
      if (from) {
        where.ts.gte = new Date(from as string);
      }
      if (to) {
        where.ts.lte = new Date(to as string);
      }
    }

    const limitNum = parseInt(limit as string, 10);
    const offsetNum = parseInt(offset as string, 10);

    const [anomalies, total] = await Promise.all([
      prisma.anomaly.findMany({
        where,
        include: {
          device: {
            select: {
              id: true,
              name: true,
              location: true,
            },
          },
          metric: {
            select: {
              id: true,
              temperature_c: true,
              vibration_g: true,
              humidity_pct: true,
              voltage_v: true,
            },
          },
        },
        orderBy: {
          ts: 'desc',
        },
        take: limitNum,
        skip: offsetNum,
      }),
      prisma.anomaly.count({ where }),
    ]);

    res.json({
      anomalies,
      pagination: {
        total,
        limit: limitNum,
        offset: offsetNum,
        hasMore: offsetNum + limitNum < total,
      },
    });
  } catch (error) {
    console.error('Error fetching anomalies:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;

