/**
 * tracker.test.js — unit tests for the in-memory metrics tracker.
 *
 * Tests the tracker in isolation by calling record() / recordAbort()
 * directly, without going through the Express middleware.
 */
import { createTracker } from '../src/tracker.js';
import { createConfig } from '../src/config.js';

/**
 * Helper: creates a tracker with a default config, optionally overridden.
 */
function makeTracker(overrides = {}) {
  const config = createConfig(overrides);
  return createTracker(config);
}

// ─── Basic recording ─────────────────────────────────────────────────────────

describe('createTracker — basic recording', () => {
  test('initial snapshot has all zeroes', () => {
    const tracker = makeTracker();
    const stats = tracker.getSnapshot();

    expect(stats.totalRequests).toBe(0);
    expect(stats.successfulRequests).toBe(0);
    expect(stats.failedRequests).toBe(0);
    expect(stats.abortedRequests).toBe(0);
    expect(stats.clientErrors).toBe(0);
    expect(stats.serverErrors).toBe(0);
    expect(stats.failureRate).toBe(0);
    expect(stats.slowRequests).toBe(0);
    expect(stats.responseTime.average).toBe(0);
    expect(stats.responseTime.min).toBe(0);
    expect(stats.responseTime.max).toBe(0);
    expect(stats.responseTime.p50).toBe(0);
    expect(stats.responseTime.p95).toBe(0);
    expect(Object.keys(stats.statusCodes)).toHaveLength(0);
    expect(Object.keys(stats.methods)).toHaveLength(0);
    expect(Object.keys(stats.endpoints)).toHaveLength(0);
  });

  test('records a single successful GET request', () => {
    const tracker = makeTracker();
    tracker.record({
      method: 'GET',
      endpoint: '/users',
      statusCode: 200,
      responseTime: 50,
      isSlow: false,
    });

    const stats = tracker.getSnapshot();
    expect(stats.totalRequests).toBe(1);
    expect(stats.successfulRequests).toBe(1);
    expect(stats.failedRequests).toBe(0);
    expect(stats.statusCodes['200']).toBe(1);
    expect(stats.methods['GET']).toBe(1);
    expect(stats.responseTime.average).toBe(50);
    expect(stats.responseTime.min).toBe(50);
    expect(stats.responseTime.max).toBe(50);
  });

  test('records a POST request', () => {
    const tracker = makeTracker();
    tracker.record({
      method: 'POST',
      endpoint: '/users',
      statusCode: 201,
      responseTime: 80,
      isSlow: false,
    });

    const stats = tracker.getSnapshot();
    expect(stats.totalRequests).toBe(1);
    expect(stats.successfulRequests).toBe(1);
    expect(stats.methods['POST']).toBe(1);
    expect(stats.statusCodes['201']).toBe(1);
  });

  test('records multiple requests and aggregates correctly', () => {
    const tracker = makeTracker();

    tracker.record({ method: 'GET', endpoint: '/a', statusCode: 200, responseTime: 100, isSlow: false });
    tracker.record({ method: 'GET', endpoint: '/b', statusCode: 200, responseTime: 200, isSlow: false });
    tracker.record({ method: 'POST', endpoint: '/a', statusCode: 201, responseTime: 150, isSlow: false });

    const stats = tracker.getSnapshot();
    expect(stats.totalRequests).toBe(3);
    expect(stats.successfulRequests).toBe(3);
    expect(stats.methods['GET']).toBe(2);
    expect(stats.methods['POST']).toBe(1);
    expect(stats.responseTime.min).toBe(100);
    expect(stats.responseTime.max).toBe(200);
    expect(stats.responseTime.average).toBe(150);
  });
});

// ─── Status code classification ──────────────────────────────────────────────

describe('createTracker — status code classification', () => {
  test('2xx responses are counted as successful', () => {
    const tracker = makeTracker();
    tracker.record({ method: 'GET', endpoint: '/ok', statusCode: 200, responseTime: 10, isSlow: false });
    tracker.record({ method: 'POST', endpoint: '/create', statusCode: 201, responseTime: 10, isSlow: false });

    const stats = tracker.getSnapshot();
    expect(stats.successfulRequests).toBe(2);
    expect(stats.failedRequests).toBe(0);
  });

  test('3xx responses are counted as successful', () => {
    const tracker = makeTracker();
    tracker.record({ method: 'GET', endpoint: '/old', statusCode: 301, responseTime: 5, isSlow: false });
    tracker.record({ method: 'GET', endpoint: '/temp', statusCode: 302, responseTime: 5, isSlow: false });

    const stats = tracker.getSnapshot();
    expect(stats.successfulRequests).toBe(2);
    expect(stats.failedRequests).toBe(0);
  });

  test('4xx responses increment clientErrors and failedRequests', () => {
    const tracker = makeTracker();
    tracker.record({ method: 'GET', endpoint: '/nope', statusCode: 400, responseTime: 10, isSlow: false });
    tracker.record({ method: 'GET', endpoint: '/auth', statusCode: 401, responseTime: 10, isSlow: false });
    tracker.record({ method: 'GET', endpoint: '/miss', statusCode: 404, responseTime: 10, isSlow: false });

    const stats = tracker.getSnapshot();
    expect(stats.failedRequests).toBe(3);
    expect(stats.clientErrors).toBe(3);
    expect(stats.serverErrors).toBe(0);
  });

  test('5xx responses increment serverErrors and failedRequests', () => {
    const tracker = makeTracker();
    tracker.record({ method: 'GET', endpoint: '/boom', statusCode: 500, responseTime: 10, isSlow: false });
    tracker.record({ method: 'GET', endpoint: '/down', statusCode: 503, responseTime: 10, isSlow: false });

    const stats = tracker.getSnapshot();
    expect(stats.failedRequests).toBe(2);
    expect(stats.serverErrors).toBe(2);
    expect(stats.clientErrors).toBe(0);
  });

  test('failure rate is calculated correctly', () => {
    const tracker = makeTracker();

    // 8 successful, 2 failed → 20% failure
    for (let i = 0; i < 8; i++) {
      tracker.record({ method: 'GET', endpoint: '/ok', statusCode: 200, responseTime: 10, isSlow: false });
    }
    tracker.record({ method: 'GET', endpoint: '/bad', statusCode: 400, responseTime: 10, isSlow: false });
    tracker.record({ method: 'GET', endpoint: '/err', statusCode: 500, responseTime: 10, isSlow: false });

    const stats = tracker.getSnapshot();
    expect(stats.failureRate).toBe(20);
  });
});

// ─── Response time statistics ────────────────────────────────────────────────

describe('createTracker — response time statistics', () => {
  test('min and max track correctly', () => {
    const tracker = makeTracker();

    tracker.record({ method: 'GET', endpoint: '/a', statusCode: 200, responseTime: 50, isSlow: false });
    tracker.record({ method: 'GET', endpoint: '/b', statusCode: 200, responseTime: 10, isSlow: false });
    tracker.record({ method: 'GET', endpoint: '/c', statusCode: 200, responseTime: 200, isSlow: false });

    const stats = tracker.getSnapshot();
    expect(stats.responseTime.min).toBe(10);
    expect(stats.responseTime.max).toBe(200);
  });

  test('average is calculated correctly', () => {
    const tracker = makeTracker();

    tracker.record({ method: 'GET', endpoint: '/a', statusCode: 200, responseTime: 100, isSlow: false });
    tracker.record({ method: 'GET', endpoint: '/b', statusCode: 200, responseTime: 200, isSlow: false });
    tracker.record({ method: 'GET', endpoint: '/c', statusCode: 200, responseTime: 300, isSlow: false });

    const stats = tracker.getSnapshot();
    expect(stats.responseTime.average).toBe(200);
  });

  test('P50 and P95 are calculated from response time samples', () => {
    const tracker = makeTracker();

    // Record 100 requests with times 1, 2, 3, ..., 100
    for (let i = 1; i <= 100; i++) {
      tracker.record({ method: 'GET', endpoint: '/test', statusCode: 200, responseTime: i, isSlow: false });
    }

    const stats = tracker.getSnapshot();
    // P50 of 1..100: ceil(100 × 0.5) - 1 = 49 → sorted[49] = 50
    expect(stats.responseTime.p50).toBe(50);
    // P95 of 1..100: ceil(100 × 0.95) - 1 = 94 → sorted[94] = 95
    expect(stats.responseTime.p95).toBe(95);
  });
});

// ─── Slow request tracking ───────────────────────────────────────────────────

describe('createTracker — slow requests', () => {
  test('slow requests are counted', () => {
    const tracker = makeTracker({ slowThreshold: 500 });

    tracker.record({ method: 'GET', endpoint: '/fast', statusCode: 200, responseTime: 100, isSlow: false });
    tracker.record({ method: 'GET', endpoint: '/slow', statusCode: 200, responseTime: 1000, isSlow: true });
    tracker.record({ method: 'GET', endpoint: '/slow2', statusCode: 200, responseTime: 600, isSlow: true });

    const stats = tracker.getSnapshot();
    expect(stats.slowRequests).toBe(2);
  });
});

// ─── Endpoint-wise stats ─────────────────────────────────────────────────────

describe('createTracker — endpoint stats', () => {
  test('tracks endpoints with method prefix', () => {
    const tracker = makeTracker();

    tracker.record({ method: 'GET', endpoint: '/users', statusCode: 200, responseTime: 50, isSlow: false });
    tracker.record({ method: 'POST', endpoint: '/users', statusCode: 201, responseTime: 80, isSlow: false });
    tracker.record({ method: 'GET', endpoint: '/users', statusCode: 200, responseTime: 100, isSlow: false });

    const eps = tracker.getEndpoints();
    expect(eps['GET /users']).toBeDefined();
    expect(eps['POST /users']).toBeDefined();
    expect(eps['GET /users'].requests).toBe(2);
    expect(eps['POST /users'].requests).toBe(1);
  });

  test('per-endpoint failed and slow counts', () => {
    const tracker = makeTracker();

    tracker.record({ method: 'GET', endpoint: '/api', statusCode: 200, responseTime: 10, isSlow: false });
    tracker.record({ method: 'GET', endpoint: '/api', statusCode: 500, responseTime: 10, isSlow: false });
    tracker.record({ method: 'GET', endpoint: '/api', statusCode: 200, responseTime: 2000, isSlow: true });

    const eps = tracker.getEndpoints();
    const ep = eps['GET /api'];
    expect(ep.requests).toBe(3);
    expect(ep.failed).toBe(1);
    expect(ep.slow).toBe(1);
  });

  test('per-endpoint average response time is calculated', () => {
    const tracker = makeTracker();

    tracker.record({ method: 'GET', endpoint: '/test', statusCode: 200, responseTime: 100, isSlow: false });
    tracker.record({ method: 'GET', endpoint: '/test', statusCode: 200, responseTime: 200, isSlow: false });

    const eps = tracker.getEndpoints();
    expect(eps['GET /test'].averageResponseTime).toBe(150);
  });
});

// ─── Abort tracking ──────────────────────────────────────────────────────────

describe('createTracker — abort tracking', () => {
  test('recordAbort increments abortedRequests', () => {
    const tracker = makeTracker();

    tracker.recordAbort({ method: 'GET', endpoint: '/slow' });
    tracker.recordAbort({ method: 'GET', endpoint: '/slow' });

    const stats = tracker.getSnapshot();
    expect(stats.abortedRequests).toBe(2);
    // Aborted requests should NOT be counted in totalRequests
    expect(stats.totalRequests).toBe(0);
  });
});

// ─── Reset ───────────────────────────────────────────────────────────────────

describe('createTracker — reset', () => {
  test('reset clears all metrics', () => {
    const tracker = makeTracker();

    tracker.record({ method: 'GET', endpoint: '/a', statusCode: 200, responseTime: 50, isSlow: false });
    tracker.record({ method: 'GET', endpoint: '/b', statusCode: 500, responseTime: 100, isSlow: true });
    tracker.recordAbort({ method: 'GET', endpoint: '/c' });

    tracker.reset();

    const stats = tracker.getSnapshot();
    expect(stats.totalRequests).toBe(0);
    expect(stats.successfulRequests).toBe(0);
    expect(stats.failedRequests).toBe(0);
    expect(stats.abortedRequests).toBe(0);
    expect(stats.clientErrors).toBe(0);
    expect(stats.serverErrors).toBe(0);
    expect(stats.slowRequests).toBe(0);
    expect(stats.responseTime.average).toBe(0);
    expect(stats.responseTime.min).toBe(0);
    expect(stats.responseTime.max).toBe(0);
    expect(stats.responseTime.p50).toBe(0);
    expect(stats.responseTime.p95).toBe(0);
    expect(Object.keys(stats.statusCodes)).toHaveLength(0);
    expect(Object.keys(stats.methods)).toHaveLength(0);
    expect(Object.keys(stats.endpoints)).toHaveLength(0);
  });
});

// ─── Snapshot immutability ───────────────────────────────────────────────────

describe('createTracker — snapshot immutability', () => {
  test('mutating returned snapshot does not affect internal state', () => {
    const tracker = makeTracker();

    tracker.record({ method: 'GET', endpoint: '/test', statusCode: 200, responseTime: 50, isSlow: false });

    const snapshot1 = tracker.getSnapshot();
    // Mutate the snapshot
    snapshot1.totalRequests = 999;
    snapshot1.statusCodes['200'] = 999;
    snapshot1.methods['GET'] = 999;
    snapshot1.endpoints['GET /test'].requests = 999;

    // Get a fresh snapshot — should be unaffected
    const snapshot2 = tracker.getSnapshot();
    expect(snapshot2.totalRequests).toBe(1);
    expect(snapshot2.statusCodes['200']).toBe(1);
    expect(snapshot2.methods['GET']).toBe(1);
    expect(snapshot2.endpoints['GET /test'].requests).toBe(1);
  });

  test('mutating getEndpoints result does not affect internal state', () => {
    const tracker = makeTracker();

    tracker.record({ method: 'GET', endpoint: '/test', statusCode: 200, responseTime: 50, isSlow: false });

    const eps1 = tracker.getEndpoints();
    eps1['GET /test'].requests = 999;

    const eps2 = tracker.getEndpoints();
    expect(eps2['GET /test'].requests).toBe(1);
  });
});

// ─── Bounded memory ──────────────────────────────────────────────────────────

describe('createTracker — bounded memory', () => {
  test('response samples are bounded by maxSamples', () => {
    const tracker = makeTracker({ maxSamples: 5 });

    // Record 10 requests — only the last 5 should remain in the sample buffer
    for (let i = 1; i <= 10; i++) {
      tracker.record({ method: 'GET', endpoint: '/test', statusCode: 200, responseTime: i * 10, isSlow: false });
    }

    const stats = tracker.getSnapshot();
    // The sample buffer should contain [60, 70, 80, 90, 100]
    // P50 of [60, 70, 80, 90, 100]: ceil(5 × 0.5) - 1 = 2 → sorted[2] = 80
    expect(stats.responseTime.p50).toBe(80);
    // Total requests is still 10 (all recorded, just sample buffer is bounded)
    expect(stats.totalRequests).toBe(10);
  });
});
