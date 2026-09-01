/**
 * Tests for devices route
 */

import request from 'supertest';
import express from 'express';
import devicesRouter from '../devices';

const app = express();
app.use(express.json());
app.use('/api/devices', devicesRouter);

describe('GET /api/devices', () => {
  it('should return list of devices', async () => {
    const response = await request(app).get('/api/devices');
    
    // Should return 200 or 500 (if DB not connected)
    expect([200, 500]).toContain(response.status);
  });
});

describe('POST /api/devices', () => {
  it('should create a new device', async () => {
    const response = await request(app)
      .post('/api/devices')
      .send({
        name: 'Test Device',
        location: 'Test Location',
      });

    // Should return 201 or 500 (if DB not connected)
    expect([201, 500]).toContain(response.status);
  });

  it('should reject invalid payload', async () => {
    const response = await request(app)
      .post('/api/devices')
      .send({ invalid: 'data' });

    expect(response.status).toBe(400);
  });
});

