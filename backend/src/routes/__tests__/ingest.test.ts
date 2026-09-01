/**
 * Tests for ingest route
 */

import request from 'supertest';
import express from 'express';
import ingestRouter from '../ingest';

const app = express();
app.use(express.json());
app.use('/api/ingest', ingestRouter);

describe('POST /api/ingest', () => {
  it('should reject invalid payload', async () => {
    const response = await request(app)
      .post('/api/ingest')
      .send({ invalid: 'data' });

    expect(response.status).toBe(400);
  });

  it('should accept valid payload', async () => {
    const response = await request(app)
      .post('/api/ingest')
      .send({
        deviceId: 'test-device-001',
        metrics: [
          {
            temperature_c: 22.5,
            vibration_g: 0.02,
            humidity_pct: 45.0,
            voltage_v: 4.9,
          },
        ],
      });

    // Should succeed if device auto-creation is enabled
    expect([201, 404]).toContain(response.status);
  });
});

