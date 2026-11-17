/**
 * Express Demo — api-monitor-lite
 *
 * A sample Express application that demonstrates how to integrate
 * api-monitor-lite for real-time API monitoring.
 *
 * Run:
 *   cd examples/express-demo
 *   npm install
 *   npm start
 *
 * Then visit:
 *   http://localhost:3000/api/success     — 200 success
 *   http://localhost:3000/api/users       — sample user data
 *   http://localhost:3000/api/error       — 500 server error
 *   http://localhost:3000/api/not-found   — 404 not found
 *   http://localhost:3000/api/slow        — ~2 second delay
 *   http://localhost:3000/monitor/stats   — live monitoring stats
 *   http://localhost:3000/monitor/endpoints — per-endpoint analytics
 *   POST http://localhost:3000/monitor/reset — reset all stats
 */
import express from 'express';
import { createMonitor } from 'api-monitor-lite';

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Initialize the monitor ─────────────────────────────────────────────────

const monitor = createMonitor({
  slowThreshold: 1000,            // Requests taking > 1000ms are "slow"
  ignorePaths: ['/monitor'],      // Don't monitor the monitoring endpoints
  maxSamples: 1000,               // Keep last 1000 response times for percentiles
  onSlowRequest: (details) => {
    console.warn(
      `⚠️  Slow API: ${details.method} ${details.endpoint} — ` +
      `${details.responseTime.toFixed(0)}ms (status ${details.statusCode})`
    );
  },
});

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(express.json());
app.use(monitor.middleware);

// ─── API Routes ──────────────────────────────────────────────────────────────

// GET /api/success — simple success response
app.get('/api/success', (req, res) => {
  res.json({ message: 'Request was successful!', timestamp: new Date().toISOString() });
});

// GET /api/users — returns sample user data
app.get('/api/users', (req, res) => {
  res.json({
    users: [
      { id: 1, name: 'Alice Johnson', email: 'alice@example.com' },
      { id: 2, name: 'Bob Smith', email: 'bob@example.com' },
      { id: 3, name: 'Charlie Brown', email: 'charlie@example.com' },
    ],
  });
});

// POST /api/users — creates a sample user
app.post('/api/users', (req, res) => {
  const { name, email } = req.body || {};
  if (!name || !email) {
    return res.status(400).json({ error: 'name and email are required' });
  }
  res.status(201).json({
    message: 'User created',
    user: { id: Date.now(), name, email },
  });
});

// GET /api/error — intentional 500 error
app.get('/api/error', (req, res) => {
  res.status(500).json({ error: 'Internal Server Error (intentional for demo)' });
});

// GET /api/not-found — intentional 404 error
app.get('/api/not-found', (req, res) => {
  res.status(404).json({ error: 'Resource not found (intentional for demo)' });
});

// GET /api/slow — intentionally slow response (~2 seconds)
app.get('/api/slow', (req, res) => {
  setTimeout(() => {
    res.json({ message: 'This response was intentionally delayed', delay: '~2000ms' });
  }, 2000);
});

// ─── Monitoring Routes ───────────────────────────────────────────────────────
// These are excluded from monitoring via ignorePaths: ['/monitor']

// GET /monitor/stats — live monitoring statistics
app.get('/monitor/stats', (req, res) => {
  res.json(monitor.getStats());
});

// GET /monitor/endpoints — endpoint-wise analytics
app.get('/monitor/endpoints', (req, res) => {
  res.json(monitor.getEndpointStats());
});

// POST /monitor/reset — reset all statistics
app.post('/monitor/reset', (req, res) => {
  monitor.resetStats();
  res.json({ message: 'Monitoring statistics have been reset' });
});

// ─── Start server ────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🚀 Express Demo Server running on http://localhost:${PORT}\n`);
  console.log('Available endpoints:');
  console.log('  GET  /api/success       — Success response');
  console.log('  GET  /api/users         — Sample user data');
  console.log('  POST /api/users         — Create user (body: { name, email })');
  console.log('  GET  /api/error         — 500 Server Error');
  console.log('  GET  /api/not-found     — 404 Not Found');
  console.log('  GET  /api/slow          — ~2s delayed response');
  console.log('');
  console.log('Monitoring:');
  console.log('  GET  /monitor/stats     — Live statistics');
  console.log('  GET  /monitor/endpoints — Endpoint analytics');
  console.log('  POST /monitor/reset     — Reset stats');
  console.log('');
});
