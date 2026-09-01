/**
 * Main Express Application Entry Point
 * 
 * Sets up Express server with routes, Socket.IO, and Prisma
 */

import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { PrismaClient } from '@prisma/client';
import { initializeSocketIO, getIOServer } from './realtime';
import { initializeMQTTBridge } from './mqtt/bridge';
import { initializeJobs } from './jobs/cleanup';
import { logger } from './utils/logger';
import ingestRouter from './routes/ingest';
import devicesRouter from './routes/devices';
import metricsRouter from './routes/metrics';
import anomaliesRouter from './routes/anomalies';
import healthRouter from './routes/health';

const app = express();
const httpServer = createServer(app);
const prisma = new PrismaClient();

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Socket.IO
initializeSocketIO(httpServer);

// Routes
app.use('/api/ingest', ingestRouter);
app.use('/api/devices', devicesRouter);
app.use('/api/metrics', metricsRouter);
app.use('/api/anomalies', anomaliesRouter);
app.use('/api/health', healthRouter);

// Root route
app.get('/', (req, res) => {
  res.json({
    name: 'IoT Anomaly Detection API',
    version: '1.0.0',
    endpoints: {
      ingest: '/api/ingest',
      devices: '/api/devices',
      metrics: '/api/metrics',
      anomalies: '/api/anomalies',
      health: '/api/health',
    },
  });
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message || 'Unknown error',
  });
});

// Start server
const PORT = process.env.PORT || process.env.BACKEND_PORT || 8080;

async function startServer() {
  try {
    // Test database connection
    await prisma.$connect();
    logger.info('Database connected');

    // Run migrations in production
    if (process.env.NODE_ENV === 'production') {
      const { execSync } = require('child_process');
      try {
        execSync('npx prisma migrate deploy', { stdio: 'inherit' });
        console.log('Migrations applied');
      } catch (error) {
        console.warn('Migration warning:', error);
      }
    }

    httpServer.listen(PORT, async () => {
      logger.info(`Server running on port ${PORT}`);
      logger.info(`API available on port ${PORT}`);
      logger.info(`Anomaly engine: ${process.env.ANOMALY_ENGINE || 'median-deviation'}`);

      // Initialize background jobs
      initializeJobs();

      // Initialize MQTT bridge if enabled
      const socketIO = getIOServer();
      if (socketIO) {
        try {
          await initializeMQTTBridge(prisma, socketIO);
        } catch (error) {
          logger.error('Failed to initialize MQTT bridge:', error);
          // Don't fail startup if MQTT fails
        }
      }

      console.log(`\nServer started successfully!`);
      console.log(`   API: http://localhost:${PORT} (internal)`);
      console.log(`   Engine: ${process.env.ANOMALY_ENGINE || 'median-deviation'}`);
      if (process.env.MQTT_ENABLE === 'true') {
        console.log(`   MQTT: Enabled`);
      }
      if (process.env.PY_ML_ENABLE === 'true') {
        console.log(`   Python ML: Enabled`);
      }
      console.log();
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  await prisma.$disconnect();
  httpServer.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');
  await prisma.$disconnect();
  httpServer.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

startServer();

