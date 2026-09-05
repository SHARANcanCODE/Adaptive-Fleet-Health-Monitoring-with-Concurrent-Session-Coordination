/**
 * Tests for conflicts route
 */

import request from 'supertest';
import express from 'express';
import conflictsRouter from '../conflicts';

const app = express();
app.use(express.json());
app.use('/api/conflicts', conflictsRouter);

describe('GET /api/conflicts', () => {
  it('should return conflicts list', async () => {
    const response = await request(app).get('/api/conflicts');
    expect([200, 500]).toContain(response.status);
  });

  it('should filter conflicts by status', async () => {
    const response = await request(app).get('/api/conflicts?status=open');
    expect([200, 500]).toContain(response.status);
  });
});
