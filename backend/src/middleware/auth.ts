import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * Validates the X-API-Key header against the configured INGEST_API_KEY
 */
export const apiKeyAuth = (req: Request, res: Response, next: NextFunction) => {
    const configuredKey = process.env.INGEST_API_KEY;

    // If no key is configured, allow all (not recommended for production but good for dev fallback)
    if (!configuredKey) {
        logger.warn('INGEST_API_KEY not configured. Ingest endpoint is publicly accessible!');
        return next();
    }

    const providedKey = req.header('X-API-Key');

    if (!providedKey || providedKey !== configuredKey) {
        logger.warn(`Unauthorized ingest attempt from ${req.ip}`);
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'Invalid or missing API key'
        });
    }

    next();
};
