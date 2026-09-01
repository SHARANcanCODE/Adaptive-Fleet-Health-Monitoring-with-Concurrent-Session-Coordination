import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

/**
 * Initialize background jobs for data maintenance
 */
export function initializeJobs() {
    const retentionDays = parseInt(process.env.DATA_RETENTION_DAYS || '7', 10);

    // Run every day at midnight
    cron.schedule('0 0 * * *', async () => {
        logger.info(`Running data cleanup job (Retention: ${retentionDays} days)`);

        try {
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - retentionDays);

            // Delete old metrics
            const deletedMetrics = await prisma.metric.deleteMany({
                where: {
                    ts: {
                        lt: cutoff
                    }
                }
            });

            // Delete old anomalies (usually linked to metrics, but better be safe)
            const deletedAnomalies = await prisma.anomaly.deleteMany({
                where: {
                    ts: {
                        lt: cutoff
                    }
                }
            });

            logger.info(`Cleanup complete: Deleted ${deletedMetrics.count} metrics and ${deletedAnomalies.count} anomalies`);
        } catch (error) {
            logger.error('Data cleanup job failed:', error);
        }
    });

    logger.info(`Data retention job initialized (Retention: ${retentionDays} days)`);
}
