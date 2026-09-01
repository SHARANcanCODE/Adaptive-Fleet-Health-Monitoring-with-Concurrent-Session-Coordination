/**
 * Devices Route Handler
 * 
 * Handles CRUD operations for devices
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { emitDeviceUpdate } from '../realtime';

const router = Router();
const prisma = new PrismaClient();

const CreateDeviceSchema = z.object({
  name: z.string().min(1),
  location: z.string().optional(),
});

// GET /api/devices - List all devices
router.get('/', async (req: Request, res: Response) => {
  try {
    const devices = await prisma.device.findMany({
      include: {
        _count: {
          select: {
            metrics: true,
            anomalies: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json({
      devices,
      count: devices.length,
    });
  } catch (error) {
    console.error('Error fetching devices:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// GET /api/devices/:id - Get device by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const device = await prisma.device.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            metrics: true,
            anomalies: true,
          },
        },
      },
    });

    if (!device) {
      return res.status(404).json({
        error: 'Device not found',
        deviceId: id,
      });
    }

    res.json(device);
  } catch (error) {
    console.error('Error fetching device:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// POST /api/devices - Create new device
router.post('/', async (req: Request, res: Response) => {
  try {
    const body = CreateDeviceSchema.parse(req.body);

    const device = await prisma.device.create({
      data: {
        name: body.name,
        location: body.location || null,
      },
    });

    emitDeviceUpdate(device.id, device);

    res.status(201).json(device);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
    }

    console.error('Error creating device:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;

