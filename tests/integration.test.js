/**
 * integration.test.js — end-to-end integration tests.
 *
 * Tests the full public API (createMonitor) through realistic Express
 * scenarios that exercise the entire pipeline:
 *   createMonitor → middleware → tracker → statistics → snapshot
 *
 * These tests simulate real-world usage patterns.
 */
import express from 'express';
import request from 'supertest';
import { createMonitor } from '../src/index.js';

// ─── Helper: build a comprehensive test app ──────────────────────────────────

function buildIntegrationApp(options = {}) {
  const monitor = createMonitor(options);
  const app = express();

  app.use(express.json());
  app.use(monitor.middleware);

  // Success endpoints
  app.get('/api/users', (req, res) => {
    res.json([{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }]);
  });

  app.post('/api/users', (req, res) => {
    res.status(201).json({ id: 3, name: req.body?.name ?? 'New User' });
  });

  app.get('/api/users/:id', (req, res) => {
    res.json({ id: req.params.id, name: 'Alice' });
  });

  app.put('/api/users/:id', (req, res) => {
    res.json({ id: req.params.id, updated: true });
  });

  app.delete('/api/users/:id', (req, res) => {
    res.json({ id: req.params.id, deleted: true });
  });

  // Error endpoints
  app.get('/api/error', (req, res) => {
    res.status(500).json({ error: 'Internal Server Error' });
  });

  app.get('/api/not-found', (req, res) => {
    res.status(404).json({ error: 'Not Found' });
  });

  app.get('/api/unauthorized', (req, res) => {
    res.status(401).json({ error: 'Unauthorized' });
  });

  // Slow endpoint
  app.get('/api/slow', (req, res) => {
    setTimeout(() => res.json({ ok: true }), 150);
  });

  // Monitoring endpoints (should be ignored if configured)
  app.get('/monitor/stats', (req, res) => {
    res.json(monitor.getStats());
  });

  app.get('/monitor/endpoints', (req, res) => {
    res.json(monitor.getEndpointStats());
  });

  app.post('/monitor/reset', (req, res) => {
    monitor.resetStats();
    res.json({ message: 'Stats reset' });
  });

  return { app, monitor };
}

// ─── Full integration flow ───────────────────────────────────────────────────

describe('integration — full monitoring flow', () => {
  test('complete monitoring scenario', async () => {
    const { app, monitor } = buildIntegrationApp({
      slowThreshold: 100,
      ignorePaths: ['/monitor'],
    });

    // Simulate realistic traffic
    await request(app).get('/api/users').expect(200);
    await request(app).get('/api/users').expect(200);
    await request(app).get('/api/users/1').expect(200);
    await request(app).post('/api/users').send({ name: 'Charlie' }).expect(201);
    await request(app).put('/api/users/1').expect(200);
    await request(app).delete('/api/users/2').expect(200);
    await request(app).get('/api/error').expect(500);
    await request(app).get('/api/not-found').expect(404);
    await request(app).get('/api/slow').expect(200);

    const stats = monitor.getStats();

    // 9 total requests (monitor endpoints are ignored)
    expect(stats.totalRequests).toBe(9);

    // 7 successful (200, 201), 2 failed (500, 404)
    expect(stats.successfulRequests).toBe(7);
    expect(stats.failedRequests).toBe(2);
    expect(stats.clientErrors).toBe(1);  // 404
    expect(stats.serverErrors).toBe(1);  // 500

    // Failure rate: 2/9 ≈ 22.22%
    expect(stats.failureRate).toBeCloseTo(22.22, 1);

    // Slow requests: the /api/slow endpoint (150ms > 100ms threshold)
    expect(stats.slowRequests).toBeGreaterThanOrEqual(1);

    // Response time
    expect(stats.responseTime.average).toBeGreaterThan(0);
    expect(stats.responseTime.min).toBeGreaterThan(0);
    expect(stats.responseTime.max).toBeGreaterThan(0);
    expect(stats.responseTime.p50).toBeGreaterThan(0);
    expect(stats.responseTime.p95).toBeGreaterThan(0);

    // Status codes
    expect(stats.statusCodes['200']).toBe(6);
    expect(stats.statusCodes['201']).toBe(1);
    expect(stats.statusCodes['404']).toBe(1);
    expect(stats.statusCodes['500']).toBe(1);

    // Methods
    expect(stats.methods['GET']).toBe(6);
    expect(stats.methods['POST']).toBe(1);
    expect(stats.methods['PUT']).toBe(1);
    expect(stats.methods['DELETE']).toBe(1);

    // Endpoints
    expect(stats.endpoints['GET /api/users']).toBeDefined();
    expect(stats.endpoints['GET /api/users'].requests).toBe(2);
    expect(stats.endpoints['GET /api/users/:id']).toBeDefined();
    expect(stats.endpoints['GET /api/users/:id'].requests).toBe(1);
  });
});

// ─── Monitor endpoints don't monitor themselves ──────────────────────────────

describe('integration — self-monitoring exclusion', () => {
  test('monitor endpoints are excluded from metrics', async () => {
    const { app, monitor } = buildIntegrationApp({
      ignorePaths: ['/monitor'],
    });

    await request(app).get('/api/users').expect(200);
    await request(app).get('/monitor/stats').expect(200);
    await request(app).get('/monitor/endpoints').expect(200);
    await request(app).post('/monitor/reset').expect(200);

    // After reset, re-check
    const { body } = await request(app).get('/monitor/stats').expect(200);
    // The /monitor/stats request itself is ignored, so total should be 0
    expect(body.totalRequests).toBe(0);
  });
});

// ─── Package import ──────────────────────────────────────────────────────────

describe('integration — package exports', () => {
  test('createMonitor is importable from index.js', async () => {
    const { createMonitor: imported } = await import('../src/index.js');
    expect(typeof imported).toBe('function');
  });

  test('createMonitor works without any options', () => {
    const monitor = createMonitor();
    expect(typeof monitor.middleware).toBe('function');
    expect(typeof monitor.getStats).toBe('function');
    expect(typeof monitor.getEndpointStats).toBe('function');
    expect(typeof monitor.resetStats).toBe('function');
  });
});

// ─── Configuration validation ────────────────────────────────────────────────

describe('integration — configuration validation', () => {
  test('throws on invalid slowThreshold', () => {
    expect(() => createMonitor({ slowThreshold: -1 })).toThrow(TypeError);
    expect(() => createMonitor({ slowThreshold: 'fast' })).toThrow(TypeError);
  });

  test('throws on invalid enabled', () => {
    expect(() => createMonitor({ enabled: 'yes' })).toThrow(TypeError);
  });

  test('throws on invalid ignorePaths', () => {
    expect(() => createMonitor({ ignorePaths: '/health' })).toThrow(TypeError);
  });

  test('throws on invalid maxSamples', () => {
    expect(() => createMonitor({ maxSamples: 0 })).toThrow(TypeError);
    expect(() => createMonitor({ maxSamples: -5 })).toThrow(TypeError);
  });

  test('throws on invalid onSlowRequest', () => {
    expect(() => createMonitor({ onSlowRequest: 'log' })).toThrow(TypeError);
  });

  test('accepts valid configuration', () => {
    const monitor = createMonitor({
      slowThreshold: 2000,
      enabled: true,
      ignorePaths: ['/health', '/ping'],
      maxSamples: 500,
      onSlowRequest: () => {},
    });
    expect(typeof monitor.middleware).toBe('function');
  });
});

// ─── Status code distribution ────────────────────────────────────────────────

describe('integration — status code distribution', () => {
  test('tracks all encountered status codes', async () => {
    const { app, monitor } = buildIntegrationApp();

    await request(app).get('/api/users').expect(200);
    await request(app).post('/api/users').expect(201);
    await request(app).get('/api/not-found').expect(404);
    await request(app).get('/api/unauthorized').expect(401);
    await request(app).get('/api/error').expect(500);

    const stats = monitor.getStats();
    expect(stats.statusCodes['200']).toBe(1);
    expect(stats.statusCodes['201']).toBe(1);
    expect(stats.statusCodes['404']).toBe(1);
    expect(stats.statusCodes['401']).toBe(1);
    expect(stats.statusCodes['500']).toBe(1);
  });
});

// ─── Percentile calculations with real traffic ───────────────────────────────

describe('integration — percentile accuracy', () => {
  test('P50 and P95 reflect the actual response time distribution', async () => {
    const { app, monitor } = buildIntegrationApp();

    // Send multiple requests to build up sample data
    for (let i = 0; i < 20; i++) {
      await request(app).get('/api/users').expect(200);
    }

    const stats = monitor.getStats();
    // P50 should be <= P95 (by definition)
    expect(stats.responseTime.p50).toBeLessThanOrEqual(stats.responseTime.p95);
    // Both should be positive
    expect(stats.responseTime.p50).toBeGreaterThan(0);
    expect(stats.responseTime.p95).toBeGreaterThan(0);
  });
});

// ─── Endpoint analytics detail ───────────────────────────────────────────────

describe('integration — endpoint analytics', () => {
  test('getEndpointStats returns per-endpoint details', async () => {
    const { app, monitor } = buildIntegrationApp();

    await request(app).get('/api/users').expect(200);
    await request(app).get('/api/users').expect(200);
    await request(app).get('/api/error').expect(500);

    const eps = monitor.getEndpointStats();

    // Check GET /api/users
    const users = eps['GET /api/users'];
    expect(users).toBeDefined();
    expect(users.requests).toBe(2);
    expect(users.failed).toBe(0);
    expect(users.averageResponseTime).toBeGreaterThan(0);
    expect(users.min).toBeGreaterThan(0);
    expect(users.max).toBeGreaterThanOrEqual(users.min);

    // Check GET /api/error
    const error = eps['GET /api/error'];
    expect(error).toBeDefined();
    expect(error.requests).toBe(1);
    expect(error.failed).toBe(1);
  });
});
