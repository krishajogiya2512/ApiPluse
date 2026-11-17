/**
 * endpoints.test.js — tests for bounded endpoint tracking (maxEndpoints).
 *
 * Covers the tracker-level cap, the per-method overflow bucket, and the
 * guarantee that global request statistics remain accurate once the limit
 * is reached. Also exercises the behavior end-to-end through Express with
 * a burst of distinct 404 URLs.
 */
import express from 'express';
import request from 'supertest';
import { createMonitor } from '../src/index.js';
import { createTracker } from '../src/tracker.js';
import { createConfig } from '../src/config.js';

function makeTracker(overrides = {}) {
  return createTracker(createConfig(overrides));
}

// ─── Tracker-level: the cap ──────────────────────────────────────────────────

describe('bounded endpoints — tracker cap', () => {
  test('distinct endpoint keys are capped at maxEndpoints (+ one overflow bucket)', () => {
    const tracker = makeTracker({ maxEndpoints: 3 });

    for (let i = 0; i < 20; i++) {
      tracker.record({
        method: 'GET',
        endpoint: `/missing-${i}`,
        statusCode: 404,
        responseTime: 5,
        isSlow: false,
      });
    }

    const eps = tracker.getEndpoints();
    // 3 real endpoint keys + 1 per-method overflow bucket
    expect(Object.keys(eps)).toHaveLength(4);
    expect(eps['GET (overflow)']).toBeDefined();
    expect(eps['GET (overflow)'].requests).toBe(17); // 20 - 3 stored keys
  });

  test('no overflow bucket is created while under the limit', () => {
    const tracker = makeTracker({ maxEndpoints: 10 });

    for (let i = 0; i < 10; i++) {
      tracker.record({ method: 'GET', endpoint: `/e-${i}`, statusCode: 200, responseTime: 1, isSlow: false });
    }

    const eps = tracker.getEndpoints();
    expect(Object.keys(eps)).toHaveLength(10);
    expect(eps['GET (overflow)']).toBeUndefined();
  });

  test('overflow bucket aggregates endpoint stats correctly', () => {
    const tracker = makeTracker({ maxEndpoints: 1 });

    tracker.record({ method: 'GET', endpoint: '/real', statusCode: 200, responseTime: 10, isSlow: false });
    for (let i = 0; i < 5; i++) {
      tracker.record({ method: 'GET', endpoint: `/x-${i}`, statusCode: 500, responseTime: 20, isSlow: false });
    }

    const eps = tracker.getEndpoints();
    expect(eps['GET /real'].requests).toBe(1);
    expect(eps['GET /real'].failed).toBe(0);

    const overflow = eps['GET (overflow)'];
    expect(overflow).toBeDefined();
    expect(overflow.requests).toBe(5);
    expect(overflow.failed).toBe(5);
    expect(overflow.totalTime).toBe(100);
    expect(overflow.min).toBe(20);
    expect(overflow.max).toBe(20);
  });

  test('already-tracked endpoints keep updating after the limit is reached', () => {
    const tracker = makeTracker({ maxEndpoints: 1 });

    tracker.record({ method: 'GET', endpoint: '/a', statusCode: 200, responseTime: 10, isSlow: false });
    tracker.record({ method: 'GET', endpoint: '/b', statusCode: 200, responseTime: 10, isSlow: false }); // → overflow
    tracker.record({ method: 'GET', endpoint: '/a', statusCode: 200, responseTime: 30, isSlow: false }); // existing key

    const eps = tracker.getEndpoints();
    expect(eps['GET /a'].requests).toBe(2);
    expect(eps['GET /a'].max).toBe(30);
    expect(eps['GET (overflow)'].requests).toBe(1);
  });

  test('overflow buckets are per HTTP method', () => {
    const tracker = makeTracker({ maxEndpoints: 1 });

    tracker.record({ method: 'GET', endpoint: '/a', statusCode: 200, responseTime: 1, isSlow: false });
    tracker.record({ method: 'POST', endpoint: '/b', statusCode: 201, responseTime: 1, isSlow: false });
    tracker.record({ method: 'POST', endpoint: '/c', statusCode: 201, responseTime: 1, isSlow: false });

    const eps = tracker.getEndpoints();
    expect(eps['POST (overflow)']).toBeDefined();
    expect(eps['POST (overflow)'].requests).toBe(2);
    // No GET overflow bucket because GET never exceeded the limit
    expect(eps['GET (overflow)']).toBeUndefined();
  });

  test('global statistics stay accurate when the endpoint limit is reached', () => {
    const tracker = makeTracker({ maxEndpoints: 2 });

    for (let i = 0; i < 10; i++) {
      tracker.record({ method: 'GET', endpoint: `/p-${i}`, statusCode: 404, responseTime: 4, isSlow: false });
    }

    const stats = tracker.getSnapshot();
    expect(stats.totalRequests).toBe(10);
    expect(stats.failedRequests).toBe(10);
    expect(stats.clientErrors).toBe(10);
    expect(stats.statusCodes['404']).toBe(10);
    expect(stats.methods['GET']).toBe(10);
    expect(stats.responseTime.average).toBe(4);
    // Endpoint map remains bounded: 2 real keys + 1 overflow bucket
    expect(Object.keys(stats.endpoints)).toHaveLength(3);
  });

  test('reset clears overflow buckets', () => {
    const tracker = makeTracker({ maxEndpoints: 1 });
    for (let i = 0; i < 5; i++) {
      tracker.record({ method: 'GET', endpoint: `/p-${i}`, statusCode: 200, responseTime: 1, isSlow: false });
    }
    tracker.reset();
    expect(Object.keys(tracker.getEndpoints())).toHaveLength(0);
  });

  test('default maxEndpoints does not bucket a normal route count', () => {
    const tracker = makeTracker(); // default maxEndpoints = 1000
    for (let i = 0; i < 50; i++) {
      tracker.record({ method: 'GET', endpoint: `/e-${i}`, statusCode: 200, responseTime: 1, isSlow: false });
    }
    expect(Object.keys(tracker.getEndpoints())).toHaveLength(50);
    expect(tracker.getEndpoints()['GET (overflow)']).toBeUndefined();
  });
});

// ─── Config validation ───────────────────────────────────────────────────────

describe('bounded endpoints — configuration', () => {
  test('rejects invalid maxEndpoints values', () => {
    expect(() => createMonitor({ maxEndpoints: 0 })).toThrow(TypeError);
    expect(() => createMonitor({ maxEndpoints: -1 })).toThrow(TypeError);
    expect(() => createMonitor({ maxEndpoints: NaN })).toThrow(TypeError);
    expect(() => createMonitor({ maxEndpoints: Infinity })).toThrow(TypeError);
    expect(() => createMonitor({ maxEndpoints: 'many' })).toThrow(TypeError);
  });

  test('accepts a valid maxEndpoints value', () => {
    const monitor = createMonitor({ maxEndpoints: 7 });
    expect(typeof monitor.middleware).toBe('function');
  });
});

// ─── End-to-end through Express ──────────────────────────────────────────────

describe('bounded endpoints — integration through Express', () => {
  test('a flood of distinct 404 URLs cannot grow the endpoint map without limit', async () => {
    const { app, monitor } = createMonitorWithApp({ maxEndpoints: 5 });

    for (let i = 0; i < 40; i++) {
      await request(app).get(`/nope-${i}`).expect(404);
    }

    const stats = monitor.getStats();
    // Global stats are exact…
    expect(stats.totalRequests).toBe(40);
    expect(stats.statusCodes['404']).toBe(40);
    expect(stats.methods['GET']).toBe(40);
    // …while the endpoint map is bounded (5 real + 1 overflow)
    expect(Object.keys(stats.endpoints).length).toBeLessThanOrEqual(6);
    expect(stats.endpoints['GET (overflow)']).toBeDefined();
  });

  test('matched routes are still tracked individually when under the limit', async () => {
    const { app, monitor } = createMonitorWithApp({ maxEndpoints: 10 });

    await request(app).get('/api/users').expect(200);
    await request(app).get('/api/users').expect(200);
    await request(app).get('/api/error').expect(500);

    const eps = monitor.getEndpointStats();
    expect(eps['GET /api/users']).toBeDefined();
    expect(eps['GET /api/users'].requests).toBe(2);
    expect(eps['GET /api/error'].failed).toBe(1);
    expect(eps['GET (overflow)']).toBeUndefined();
  });
});

/** Builds a small Express app wired to a monitor with the given options. */
function createMonitorWithApp(options = {}) {
  const monitor = createMonitor(options);
  const app = express();
  app.use(express.json());
  app.use(monitor.middleware);
  app.get('/api/users', (req, res) => res.json([{ id: 1 }]));
  app.get('/api/error', (req, res) => res.status(500).json({ error: 'boom' }));
  return { app, monitor };
}
