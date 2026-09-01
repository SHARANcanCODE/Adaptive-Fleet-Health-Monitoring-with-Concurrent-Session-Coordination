/**
 * Metrics Route Handler
 * 
 * Handles querying metrics with filters and pagination
 */

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// GET /api/metrics - Query metrics with filters
router.get('/', async (req: Request, res: Response) => {
  try {
    const {
      deviceId,
      from,
      to,
      limit = '1000',
      offset = '0',
    } = req.query;

    const where: any = {};

    if (deviceId) {
      where.deviceId = deviceId as string;
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

    const [metrics, total] = await Promise.all([
      prisma.metric.findMany({
        where,
        include: {
          device: {
            select: {
              id: true,
              name: true,
              location: true,
            },
          },
        },
        orderBy: {
          ts: 'desc',
        },
        take: limitNum,
        skip: offsetNum,
      }),
      prisma.metric.count({ where }),
    ]);

    res.json({
      metrics,
      pagination: {
        total,
        limit: limitNum,
        offset: offsetNum,
        hasMore: offsetNum + limitNum < total,
      },
    });
  } catch (error) {
    console.error('Error fetching metrics:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;

