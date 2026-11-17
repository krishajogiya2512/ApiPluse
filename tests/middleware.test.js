/**
 * middleware.test.js — tests the Express middleware integration.
 *
 * Uses Supertest to send real HTTP requests through a minimal Express app
 * that has the monitor middleware installed.  This validates that:
 *  - The middleware hooks into the Express lifecycle correctly.
 *  - Configuration options (enabled, ignorePaths, slowThreshold) work.
 *  - The onSlowRequest callback fires (and doesn't crash on throw).
 */
import express from 'express';
import request from 'supertest';
import { createMonitor } from '../src/monitor.js';

// ─── Helper: build a test app ────────────────────────────────────────────────

function buildApp(monitorOptions = {}) {
  const monitor = createMonitor(monitorOptions);
  const app = express();

  app.use(express.json());
  app.use(monitor.middleware);

  app.get('/success', (req, res) => res.status(200).json({ ok: true }));
  app.post('/create', (req, res) => res.status(201).json({ created: true }));
  app.put('/update', (req, res) => res.status(200).json({ updated: true }));
  app.patch('/patch', (req, res) => res.status(200).json({ patched: true }));
  app.delete('/remove', (req, res) => res.status(200).json({ deleted: true }));

  app.get('/bad-request', (req, res) => res.status(400).json({ error: 'bad' }));
  app.get('/unauthorized', (req, res) => res.status(401).json({ error: 'auth' }));
  app.get('/not-found', (req, res) => res.status(404).json({ error: 'missing' }));
  app.get('/server-error', (req, res) => res.status(500).json({ error: 'boom' }));

  app.get('/redirect', (req, res) => res.redirect(301, '/success'));

  app.get('/slow', (req, res) => {
    setTimeout(() => res.json({ ok: true }), 100);
  });

  app.get('/health', (req, res) => res.json({ status: 'up' }));
  app.get('/monitor/stats', (req, res) => res.json(monitor.getStats()));

  // Route with a parameter pattern
  app.get('/users/:id', (req, res) => res.json({ id: req.params.id }));

  return { app, monitor };
}

// ─── Middleware initialization ────────────────────────────────────────────────

describe('middleware — initialization', () => {
  test('middleware is a function', () => {
    const { monitor } = buildApp();
    expect(typeof monitor.middleware).toBe('function');
  });

  test('createMonitor returns getStats, getEndpointStats, resetStats', () => {
    const { monitor } = buildApp();
    expect(typeof monitor.getStats).toBe('function');
    expect(typeof monitor.getEndpointStats).toBe('function');
    expect(typeof monitor.resetStats).toBe('function');
  });
});

// ─── Request tracking ────────────────────────────────────────────────────────

describe('middleware — request tracking', () => {
  test('tracks a successful GET request', async () => {
    const { app, monitor } = buildApp();

    await request(app).get('/success').expect(200);

    const stats = monitor.getStats();
    expect(stats.totalRequests).toBe(1);
    expect(stats.successfulRequests).toBe(1);
    expect(stats.failedRequests).toBe(0);
  });

  test('tracks a POST request', async () => {
    const { app, monitor } = buildApp();

    await request(app).post('/create').send({ name: 'test' }).expect(201);

    const stats = monitor.getStats();
    expect(stats.totalRequests).toBe(1);
    expect(stats.methods['POST']).toBe(1);
    expect(stats.statusCodes['201']).toBe(1);
  });

  test('tracks PUT, PATCH, DELETE requests', async () => {
    const { app, monitor } = buildApp();

    await request(app).put('/update').expect(200);
    await request(app).patch('/patch').expect(200);
    await request(app).delete('/remove').expect(200);

    const stats = monitor.getStats();
    expect(stats.totalRequests).toBe(3);
    expect(stats.methods['PUT']).toBe(1);
    expect(stats.methods['PATCH']).toBe(1);
    expect(stats.methods['DELETE']).toBe(1);
  });
});

// ─── Error tracking ──────────────────────────────────────────────────────────

describe('middleware — error tracking', () => {
  test('400 response increments failed and clientErrors', async () => {
    const { app, monitor } = buildApp();

    await request(app).get('/bad-request').expect(400);

    const stats = monitor.getStats();
    expect(stats.failedRequests).toBe(1);
    expect(stats.clientErrors).toBe(1);
    expect(stats.serverErrors).toBe(0);
  });

  test('500 response increments failed and serverErrors', async () => {
    const { app, monitor } = buildApp();

    await request(app).get('/server-error').expect(500);

    const stats = monitor.getStats();
    expect(stats.failedRequests).toBe(1);
    expect(stats.serverErrors).toBe(1);
    expect(stats.clientErrors).toBe(0);
  });

  test('failure rate is calculated from real traffic', async () => {
    const { app, monitor } = buildApp();

    // 4 successful + 1 failed = 20% failure
    for (let i = 0; i < 4; i++) {
      await request(app).get('/success').expect(200);
    }
    await request(app).get('/server-error').expect(500);

    const stats = monitor.getStats();
    expect(stats.failureRate).toBe(20);
  });

  test('redirect (301) is counted as successful', async () => {
    const { app, monitor } = buildApp();

    // Supertest will follow the redirect by default
    await request(app).get('/redirect');

    const stats = monitor.getStats();
    // The redirect itself should be counted as successful (3xx → success)
    expect(stats.successfulRequests).toBeGreaterThanOrEqual(1);
  });
});

// ─── Response time ───────────────────────────────────────────────────────────

describe('middleware — response time', () => {
  test('response time is a positive number', async () => {
    const { app, monitor } = buildApp();

    await request(app).get('/success').expect(200);

    const stats = monitor.getStats();
    expect(stats.responseTime.average).toBeGreaterThan(0);
    expect(stats.responseTime.min).toBeGreaterThan(0);
    expect(stats.responseTime.max).toBeGreaterThan(0);
  });

  test('min <= average <= max', async () => {
    const { app, monitor } = buildApp();

    await request(app).get('/success').expect(200);
    await request(app).get('/slow').expect(200);
    await request(app).get('/success').expect(200);

    const stats = monitor.getStats();
    expect(stats.responseTime.min).toBeLessThanOrEqual(stats.responseTime.average);
    expect(stats.responseTime.average).toBeLessThanOrEqual(stats.responseTime.max);
  });
});

// ─── Slow request detection ──────────────────────────────────────────────────

describe('middleware — slow request detection', () => {
  test('slow requests are detected based on threshold', async () => {
    // Set a very low threshold so our delayed route triggers it
    const { app, monitor } = buildApp({ slowThreshold: 50 });

    await request(app).get('/slow').expect(200); // 100ms delay > 50ms threshold

    const stats = monitor.getStats();
    expect(stats.slowRequests).toBeGreaterThanOrEqual(1);
  });

  test('onSlowRequest callback is invoked', async () => {
    let callbackData = null;
    const { app } = buildApp({
      slowThreshold: 50,
      onSlowRequest: (details) => {
        callbackData = details;
      },
    });

    await request(app).get('/slow').expect(200);

    expect(callbackData).not.toBeNull();
    expect(callbackData.method).toBe('GET');
    expect(callbackData.endpoint).toBe('/slow');
    expect(callbackData.responseTime).toBeGreaterThanOrEqual(50);
  });

  test('callback exception does not crash the application', async () => {
    const { app, monitor } = buildApp({
      slowThreshold: 50,
      onSlowRequest: () => {
        throw new Error('Intentional callback error');
      },
    });

    // This should NOT throw
    const response = await request(app).get('/slow');
    expect(response.status).toBe(200);

    // Stats should still be recorded
    const stats = monitor.getStats();
    expect(stats.totalRequests).toBe(1);
  });
});

// ─── Ignored paths ───────────────────────────────────────────────────────────

describe('middleware — ignored paths', () => {
  test('ignored paths are excluded from metrics', async () => {
    const { app, monitor } = buildApp({
      ignorePaths: ['/health', '/monitor'],
    });

    await request(app).get('/health').expect(200);
    await request(app).get('/monitor/stats').expect(200);
    await request(app).get('/success').expect(200);

    const stats = monitor.getStats();
    expect(stats.totalRequests).toBe(1); // Only /success counted
  });
});

// ─── Disabled monitoring ─────────────────────────────────────────────────────

describe('middleware — disabled monitoring', () => {
  test('disabled monitor does not collect metrics', async () => {
    const { app, monitor } = buildApp({ enabled: false });

    await request(app).get('/success').expect(200);

    const stats = monitor.getStats();
    expect(stats.totalRequests).toBe(0);
  });

  test('disabled monitor still allows requests to pass through', async () => {
    const { app } = buildApp({ enabled: false });

    const response = await request(app).get('/success');
    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
  });
});

// ─── Endpoint-wise stats via middleware ───────────────────────────────────────

describe('middleware — endpoint-wise stats', () => {
  test('different endpoints are tracked separately', async () => {
    const { app, monitor } = buildApp();

    await request(app).get('/success').expect(200);
    await request(app).get('/success').expect(200);
    await request(app).post('/create').expect(201);

    const eps = monitor.getEndpointStats();
    expect(eps['GET /success']).toBeDefined();
    expect(eps['POST /create']).toBeDefined();
    expect(eps['GET /success'].requests).toBe(2);
    expect(eps['POST /create'].requests).toBe(1);
  });

  test('Express route patterns are used for parameterized routes', async () => {
    const { app, monitor } = buildApp();

    await request(app).get('/users/1').expect(200);
    await request(app).get('/users/2').expect(200);
    await request(app).get('/users/42').expect(200);

    const eps = monitor.getEndpointStats();
    // All three should be grouped under the route pattern, not separate URLs
    expect(eps['GET /users/:id']).toBeDefined();
    expect(eps['GET /users/:id'].requests).toBe(3);
  });
});

// ─── Method-wise stats ───────────────────────────────────────────────────────

describe('middleware — method-wise stats', () => {
  test('all HTTP methods are tracked', async () => {
    const { app, monitor } = buildApp();

    await request(app).get('/success').expect(200);
    await request(app).post('/create').expect(201);
    await request(app).put('/update').expect(200);
    await request(app).patch('/patch').expect(200);
    await request(app).delete('/remove').expect(200);

    const stats = monitor.getStats();
    expect(stats.methods['GET']).toBe(1);
    expect(stats.methods['POST']).toBe(1);
    expect(stats.methods['PUT']).toBe(1);
    expect(stats.methods['PATCH']).toBe(1);
    expect(stats.methods['DELETE']).toBe(1);
  });
});

// ─── Reset ───────────────────────────────────────────────────────────────────

describe('middleware — reset', () => {
  test('resetStats clears all metrics', async () => {
    const { app, monitor } = buildApp();

    await request(app).get('/success').expect(200);
    await request(app).get('/server-error').expect(500);

    monitor.resetStats();

    const stats = monitor.getStats();
    expect(stats.totalRequests).toBe(0);
    expect(stats.successfulRequests).toBe(0);
    expect(stats.failedRequests).toBe(0);
  });
});

// ─── Edge cases ──────────────────────────────────────────────────────────────

describe('middleware — edge cases', () => {
  test('unknown route returns 404 and is tracked', async () => {
    const { app, monitor } = buildApp();

    await request(app).get('/does-not-exist').expect(404);

    const stats = monitor.getStats();
    // Express default 404 is counted
    expect(stats.totalRequests).toBe(1);
  });

  test('HEAD request is tracked', async () => {
    const { app, monitor } = buildApp();

    await request(app).head('/success').expect(200);

    const stats = monitor.getStats();
    expect(stats.totalRequests).toBe(1);
    expect(stats.methods['HEAD']).toBe(1);
  });

  test('OPTIONS request is tracked', async () => {
    const { app, monitor } = buildApp();

    await request(app).options('/success').expect(200);

    const stats = monitor.getStats();
    expect(stats.totalRequests).toBe(1);
    expect(stats.methods['OPTIONS']).toBe(1);
  });
});
