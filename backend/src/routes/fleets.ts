/**
 * Fleets Route Handler
 * 
 * Handles multi-fleet import, duplicate-ID detection and resolution,
 * and retrieval of the live merge audit log.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { emitFleetMerge, emitDeviceUpdate } from '../realtime';
import { logger } from '../utils/logger';

const router = Router();
const prisma = new PrismaClient();

const DeviceImportSchema = z.object({
  externalId: z.string().min(1),
  name: z.string().min(1),
  region: z.string().optional(),
  location: z.string().optional(),
});

const FleetImportSchema = z.object({
  fleetId: z.string().min(1),
  devices: z.array(DeviceImportSchema).min(1),
});

// POST /api/fleets/import - Import fleet devices with duplicate ID resolution
router.post('/import', async (req: Request, res: Response) => {
  try {
    const { fleetId, devices } = FleetImportSchema.parse(req.body);
    logger.info(`Processing fleet import for '${fleetId}' with ${devices.length} devices`);

    const results = [];
    const collisions = [];

    for (const dev of devices) {
      // 1. Check if device with this externalId already exists in THIS fleet (idempotent re-import)
      const existingInSameFleet = await prisma.device.findUnique({
        where: {
          externalId_fleetId: {
            externalId: dev.externalId,
            fleetId: fleetId,
          },
        },
      });

      if (existingInSameFleet) {
        // Update device metadata idempotently
        const updated = await prisma.device.update({
          where: { id: existingInSameFleet.id },
          data: {
            name: dev.name,
            region: dev.region || existingInSameFleet.region,
            location: dev.location || existingInSameFleet.location,
          },
        });
        emitDeviceUpdate(updated.id, updated);
        results.push({ action: 'updated', device: updated });
        continue;
      }

      // 2. Check if a device with this externalId already exists in ANOTHER fleet
      const existingInOtherFleet = await prisma.device.findFirst({
        where: {
          externalId: dev.externalId,
        },
      });

      if (existingInOtherFleet) {
        // Collision detected: synthesize a unique internal ID to preserve both devices' independent histories
        const resolvedId = `${dev.externalId}~${fleetId}`;

        // Create the new device with conflict link
        const newDevice = await prisma.device.create({
          data: {
            id: resolvedId,
            externalId: dev.externalId,
            fleetId: fleetId,
            name: dev.name,
            region: dev.region || null,
            location: dev.location || null,
            conflictWithId: existingInOtherFleet.id,
          },
        });

        // Also update the counterpart device so both point to each other for easy bidirectional inspection
        if (!existingInOtherFleet.conflictWithId) {
          const updatedCounterpart = await prisma.device.update({
            where: { id: existingInOtherFleet.id },
            data: { conflictWithId: resolvedId },
          });
          emitDeviceUpdate(updatedCounterpart.id, updatedCounterpart);
        }

        // Record merge audit event
        const mergeEvent = await prisma.fleetMergeEvent.create({
          data: {
            fleetId: fleetId,
            externalId: dev.externalId,
            resolvedDeviceId: resolvedId,
            conflictingDeviceId: existingInOtherFleet.id,
          },
        });

        // Seed initial telemetry points so conflict & merging devices immediately have full graphs
        await seedInitialMetricsForDevice(resolvedId);

        logger.warn(
          `Cross-fleet collision resolved: ${dev.externalId} in ${fleetId} -> internal ID ${resolvedId}, conflicting with ${existingInOtherFleet.id}`
        );

        emitFleetMerge(mergeEvent, newDevice);
        emitDeviceUpdate(newDevice.id, newDevice);

        collisions.push(mergeEvent);
        results.push({ action: 'collision_resolved', device: newDevice, mergeEvent });
      } else {
        // 3. No conflict: create cleanly with id = externalId
        const newDevice = await prisma.device.create({
          data: {
            id: dev.externalId,
            externalId: dev.externalId,
            fleetId: fleetId,
            name: dev.name,
            region: dev.region || null,
            location: dev.location || null,
          },
        });

        await seedInitialMetricsForDevice(newDevice.id);

        emitDeviceUpdate(newDevice.id, newDevice);
        results.push({ action: 'created', device: newDevice });
      }
    }

    res.status(201).json({
      success: true,
      fleetId,
      totalProcessed: devices.length,
      collisionsCount: collisions.length,
      collisions,
      results,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
    }

    logger.error('Error during fleet import:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// GET /api/fleets/merge-log - Retrieve merge audit history
router.get('/merge-log', async (req: Request, res: Response) => {
  try {
    const events = await prisma.fleetMergeEvent.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json({
      events,
      count: events.length,
    });
  } catch (error) {
    console.error('Error fetching fleet merge log:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

async function seedInitialMetricsForDevice(deviceId: string) {
  try {
    const count = await prisma.metric.count({ where: { deviceId } });
    if (count > 0) return;

    const now = Date.now();
    const metricsData = [];
    for (let i = 25; i >= 0; i--) {
      const ts = new Date(now - i * 5000);
      metricsData.push({
        deviceId,
        ts,
        temperature_c: Number((22.0 + Math.sin(i * 0.4) * 1.5 + (Math.random() - 0.5) * 0.4).toFixed(2)),
        vibration_g: Number((0.02 + Math.cos(i * 0.3) * 0.005 + (Math.random() - 0.5) * 0.002).toFixed(4)),
        humidity_pct: Number((45.0 + Math.sin(i * 0.2) * 2.0 + (Math.random() - 0.5) * 0.8).toFixed(1)),
        voltage_v: Number((5.0 + (Math.random() - 0.5) * 0.05).toFixed(3)),
      });
    }
    await prisma.metric.createMany({
      data: metricsData,
    });
  } catch (err) {
    logger.warn(`Could not pre-seed metrics for device ${deviceId}:`, err);
  }
}

export default router;
