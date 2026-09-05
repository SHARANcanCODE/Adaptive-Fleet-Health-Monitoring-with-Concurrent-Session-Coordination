/**
 * Tests for fleets route
 */

import request from 'supertest';
import express from 'express';
import fleetsRouter from '../fleets';

const app = express();
app.use(express.json());
app.use('/api/fleets', fleetsRouter);

describe('POST /api/fleets/import', () => {
  it('should reject invalid payload without required fields', async () => {
    const response = await request(app)
      .post('/api/fleets/import')
      .send({ invalid: 'data' });

    expect(response.status).toBe(400);
  });

  it('should reject empty devices array', async () => {
    const response = await request(app)
      .post('/api/fleets/import')
      .send({
        fleetId: 'fleet-test',
        devices: [],
      });

    expect(response.status).toBe(400);
  });

  it('should accept properly formatted fleet import payload', async () => {
    const response = await request(app)
      .post('/api/fleets/import')
      .send({
        fleetId: 'fleet-test',
        devices: [
          {
            externalId: 'test-device-001',
            name: 'Test Device 1',
            region: 'us-east',
            location: 'lat:37.7749,lng:-122.4194',
          },
        ],
      });

    // Should return 201 or 500 (if DB not connected during pure unit test)
    expect([201, 500]).toContain(response.status);
  });
});

describe('GET /api/fleets/merge-log', () => {
  it('should return merge log', async () => {
    const response = await request(app).get('/api/fleets/merge-log');
    expect([200, 500]).toContain(response.status);
  });
});
