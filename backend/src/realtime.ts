/**
 * Socket.IO Real-Time Communication Module
 * 
 * Handles real-time updates for metrics and anomalies
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

export function getIO(): SocketIOServer | null {
  return io;
}

export function getIOServer(): SocketIOServer | null {
  return io;
}

