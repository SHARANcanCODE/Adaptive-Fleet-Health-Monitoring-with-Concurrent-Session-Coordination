/**
 * Tests for health route
 */

import request from 'supertest';
import express from 'express';
import healthRouter from '../health';

const app = express();
app.use('/api/health', healthRouter);

describe('GET /api/health', () => {
  it('should return health status', async () => {
    const response = await request(app).get('/api/health');
    
    // Should return 200 or 503 (if DB not connected)
    expect([200, 503]).toContain(response.status);
    
    if (response.status === 200) {
      expect(response.body).toHaveProperty('status');
      expect(response.body.status).toBe('ok');
    }
  });
});

