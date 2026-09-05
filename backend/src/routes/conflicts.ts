/**
 * Conflicts Route Handler
 * 
 * Handles querying, acknowledging, and resolving region-based cross-device conflicts
 * with rich device anomaly breakdowns and regional correlation analysis.
 */

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { emitConflictUpdated } from '../realtime';

const router = Router();
const prisma = new PrismaClient();

// GET /api/conflicts - List all conflicts with enriched device anomaly data
router.get('/', async (req: Request, res: Response) => {
  try {
    const { status, region } = req.query;
    const where: any = {};

    if (status) {
      where.status = status as string;
    }

    if (region) {
      where.region = region as string;
    }

    const conflicts = await prisma.conflict.findMany({
      where,
      orderBy: {
        updatedAt: 'desc',
      },
    });

    const enrichedConflicts = await Promise.all(
      conflicts.map(async (conflict) => {
        const deviceIds = Array.isArray(conflict.deviceIds) ? (conflict.deviceIds as string[]) : [];

        const deviceDetails = await Promise.all(
          deviceIds.map(async (devId) => {
            const device = await prisma.device.findUnique({
              where: { id: devId },
              select: { id: true, name: true, region: true, location: true },
            });

            const latestAnomaly = await prisma.anomaly.findFirst({
              where: { deviceId: devId, flagged: true },
              orderBy: { ts: 'desc' },
              include: { metric: true },
            });

            return {
              id: devId,
              name: device?.name || devId,
              region: device?.region || conflict.region,
              location: device?.location,
              anomaly: latestAnomaly
                ? {
                    id: latestAnomaly.id,
                    type: latestAnomaly.type,
                    score: Number(latestAnomaly.score.toFixed(2)),
                    metricChannel: latestAnomaly.metricChannel,
                    ts: latestAnomaly.ts,
                    metric: latestAnomaly.metric
                      ? {
                          temperature_c: latestAnomaly.metric.temperature_c,
                          voltage_v: latestAnomaly.metric.voltage_v,
                          vibration_g: latestAnomaly.metric.vibration_g,
                          humidity_pct: latestAnomaly.metric.humidity_pct,
                        }
                      : null,
                  }
                : null,
            };
          })
        );

        const failureModes = deviceDetails.map((d) => d.anomaly?.type).filter(Boolean);
        const channels = deviceDetails.map((d) => d.anomaly?.metricChannel).filter(Boolean);
        const uniqueModes = Array.from(new Set(failureModes));
        const uniqueChannels = Array.from(new Set(channels));

        let correlationType = 'Correlated Regional Anomaly';
        if (uniqueModes.length === 1 && uniqueModes[0]) {
          correlationType = `Correlated ${uniqueModes[0].toUpperCase()} Event`;
        } else if (uniqueChannels.length === 1 && uniqueChannels[0]) {
          correlationType = `Synchronized ${uniqueChannels[0].replace('_', ' ').toUpperCase()} Incident`;
        } else {
          correlationType = `Concurrent Regional Anomaly (${deviceDetails.length} Devices)`;
        }

        return {
          ...conflict,
          devices: deviceDetails,
          correlationType,
          dominantChannel: uniqueChannels[0] || 'temperature_c',
          matchedFailureMode: uniqueModes.length === 1 ? uniqueModes[0] : null,
          anomalyCount: failureModes.length,
        };
      })
    );

    res.json({
      conflicts: enrichedConflicts,
      count: enrichedConflicts.length,
    });
  } catch (error) {
    console.error('Error fetching conflicts:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// GET /api/conflicts/:id - Get conflict by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const conflict = await prisma.conflict.findUnique({
      where: { id },
    });

    if (!conflict) {
      return res.status(404).json({
        error: 'Conflict not found',
        conflictId: id,
      });
    }

    res.json(conflict);
  } catch (error) {
    console.error('Error fetching conflict:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// POST /api/conflicts/:id/acknowledge - Acknowledge an active conflict
router.post('/:id/acknowledge', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const conflict = await prisma.conflict.findUnique({
      where: { id },
    });

    if (!conflict) {
      return res.status(404).json({
        error: 'Conflict not found',
        conflictId: id,
      });
    }

    const updated = await prisma.conflict.update({
      where: { id },
      data: {
        status: 'acknowledged',
        updatedAt: new Date(),
      },
    });

    emitConflictUpdated(updated);

    res.json({
      success: true,
      conflict: updated,
    });
  } catch (error) {
    console.error('Error acknowledging conflict:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// POST /api/conflicts/:id/resolve - Resolve a conflict
router.post('/:id/resolve', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const conflict = await prisma.conflict.findUnique({
      where: { id },
    });

    if (!conflict) {
      return res.status(404).json({
        error: 'Conflict not found',
        conflictId: id,
      });
    }

    const updated = await prisma.conflict.update({
      where: { id },
      data: {
        status: 'resolved',
        updatedAt: new Date(),
      },
    });

    emitConflictUpdated(updated);

    res.json({
      success: true,
      conflict: updated,
    });
  } catch (error) {
    console.error('Error resolving conflict:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
