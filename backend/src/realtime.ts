/**
 * Socket.IO Real-Time Communication Module
 * 
 * Handles real-time updates for metrics, anomalies, devices, conflicts, fleet merges, and spotlights
 */

import { Server as SocketIOServer } from 'socket.io';
import type { Socket as ServerSocket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { logger } from './utils/logger';

let io: SocketIOServer | null = null;

export function initializeSocketIO(httpServer: HTTPServer): SocketIOServer {
  const corsOrigin = process.env.SOCKET_IO_CORS || '*';
  
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: corsOrigin,
      methods: ['GET', 'POST'],
    },
    path: '/socket.io',
  });

  io.on('connection', (socket: ServerSocket) => {
    logger.info(`Client connected: ${socket.id}`);

    socket.on('subscribe:device', (deviceId: string) => {
      socket.join(`device:${deviceId}`);
      logger.debug(`Client ${socket.id} subscribed to device ${deviceId}`);
    });

    socket.on('unsubscribe:device', (deviceId: string) => {
      socket.leave(`device:${deviceId}`);
      logger.debug(`Client ${socket.id} unsubscribed from device ${deviceId}`);
    });

    // Cross-view spotlight event relay: client sets spotlight, server broadcasts to all clients
    socket.on('spotlight:set', (data: { deviceIds: string[]; sourceView?: string }) => {
      logger.debug(`Spotlight set by ${socket.id} for devices: ${data.deviceIds?.join(', ')}`);
      io?.emit('spotlight:update', {
        deviceIds: data.deviceIds || [],
        sourceView: data.sourceView,
        ts: new Date().toISOString(),
      });
    });

    socket.on('disconnect', () => {
      logger.info(`Client disconnected: ${socket.id}`);
    });
  });

  return io;
}

export function emitMetricNew(deviceId: string, metric: any): void {
  if (!io) {
    logger.warn('Socket.IO not initialized, cannot emit metric:new');
    return;
  }

  io.to(`device:${deviceId}`).emit('metric:new', {
    deviceId,
    metric,
  });

  // Also emit to general namespace
  io.emit('metric:new', {
    deviceId,
    metric,
  });
}

export function emitAnomalyNew(deviceId: string, anomaly: any): void {
  if (!io) {
    logger.warn('Socket.IO not initialized, cannot emit anomaly:new');
    return;
  }

  io.to(`device:${deviceId}`).emit('anomaly:new', {
    deviceId,
    anomaly,
  });

  // Also emit to general namespace
  io.emit('anomaly:new', {
    deviceId,
    anomaly,
  });
}

export function emitDeviceUpdate(deviceId: string, device: any): void {
  if (!io) {
    logger.warn('Socket.IO not initialized, cannot emit device:update');
    return;
  }

  io.to(`device:${deviceId}`).emit('device:update', {
    deviceId,
    device,
  });

  io.emit('device:update', {
    deviceId,
    device,
  });
}

export function emitConflictNew(conflict: any): void {
  if (!io) {
    logger.warn('Socket.IO not initialized, cannot emit conflict:new');
    return;
  }

  io.emit('conflict:new', {
    conflict,
  });
}

export function emitConflictUpdated(conflict: any): void {
  if (!io) {
    logger.warn('Socket.IO not initialized, cannot emit conflict:updated');
    return;
  }

  io.emit('conflict:updated', {
    conflict,
  });
}

export function emitFleetMerge(mergeEvent: any, device?: any): void {
  if (!io) {
    logger.warn('Socket.IO not initialized, cannot emit fleet:merge');
    return;
  }

  io.emit('fleet:merge', {
    event: mergeEvent,
    device: device || null,
  });
}

export function emitSpotlightUpdate(deviceIds: string[], sourceView?: string): void {
  if (!io) {
    logger.warn('Socket.IO not initialized, cannot emit spotlight:update');
    return;
  }

  io.emit('spotlight:update', {
    deviceIds,
    sourceView,
    ts: new Date().toISOString(),
  });
}

export function emitSimulatorSeed(seed: string | number): void {
  if (!io) {
    logger.warn('Socket.IO not initialized, cannot emit simulator:seed_changed');
    return;
  }

  io.emit('simulator:seed_changed', {
    seed,
    ts: new Date().toISOString(),
  });
}

export function getIO(): SocketIOServer | null {
  return io;
}

export function getIOServer(): SocketIOServer | null {
  return io;
}

