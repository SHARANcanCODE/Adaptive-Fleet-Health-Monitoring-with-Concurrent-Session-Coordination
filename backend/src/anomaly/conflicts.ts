/**
 * Regional Cross-Device Conflict Detection
 *
 * Checks for concurrent anomalies across multiple devices within the same region.
 * If >= 2 devices in a region have anomalies within a recent time window (default: 60s),
 * a Conflict record is created or updated and broadcasted via Socket.IO.
 */

import { PrismaClient } from '@prisma/client';
import { emitConflictNew, emitConflictUpdated } from '../realtime';
import { logger } from '../utils/logger';

const CONFLICT_WINDOW_SECONDS = 60;

export async function checkAndRecordConflict(
  prisma: PrismaClient,
  deviceId: string,
  region: string | null | undefined
): Promise<void> {
  if (!region) {
    return;
  }

  try {
    const windowStart = new Date(Date.now() - CONFLICT_WINDOW_SECONDS * 1000);

    // Find all anomalies in this region within the conflict window
    const recentAnomalies = await prisma.anomaly.findMany({
      where: {
        ts: { gte: windowStart },
        flagged: true,
        device: {
          region: region,
        },
      },
      select: {
        deviceId: true,
      },
      distinct: ['deviceId'],
    });

    const involvedDeviceIds = Array.from(
      new Set(recentAnomalies.map((a) => a.deviceId))
    );

    // Ensure the triggering deviceId is included if it belongs to this region
    if (!involvedDeviceIds.includes(deviceId)) {
      involvedDeviceIds.push(deviceId);
    }

    // A conflict is triggered if at least 2 distinct devices in the same region have concurrent anomalies
    if (involvedDeviceIds.length < 2) {
      return;
    }

    // Check if there is already an active (open or acknowledged) conflict in this region
    const existingConflict = await prisma.conflict.findFirst({
      where: {
        region: region,
        status: { in: ['open', 'acknowledged'] },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (existingConflict) {
      // Merge any new device IDs
      const currentIds = Array.isArray(existingConflict.deviceIds)
        ? (existingConflict.deviceIds as string[])
        : [];
      const mergedIds = Array.from(new Set([...currentIds, ...involvedDeviceIds]));

      // If new devices joined the conflict, update it
      const updatedConflict = await prisma.conflict.update({
        where: { id: existingConflict.id },
        data: {
          deviceIds: mergedIds,
          updatedAt: new Date(),
        },
      });

      logger.info(
        `Updated active conflict ${existingConflict.id} in region ${region} with ${mergedIds.length} devices`
      );
      emitConflictUpdated(updatedConflict);
    } else {
      // Create a new conflict record
      const newConflict = await prisma.conflict.create({
        data: {
          region: region,
          deviceIds: involvedDeviceIds,
          status: 'open',
        },
      });

      logger.warn(
        `Created new region conflict ${newConflict.id} for region ${region} involving devices: ${involvedDeviceIds.join(', ')}`
      );
      emitConflictNew(newConflict);
    }
  } catch (error) {
    logger.error(`Error in checkAndRecordConflict for region ${region}:`, error);
  }
}
