# ApiPulse

> Lightweight Express.js API monitoring middleware for Node.js — tracks response times, error rates, slow requests, and endpoint analytics with zero configuration.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)

---

## Table of Contents

- [Problem Statement](#problem-statement)
- [Why API Monitoring Matters](#why-api-monitoring-matters)
- [Features](#features)
- [Technology Stack](#technology-stack)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration Reference](#configuration-reference)
- [Statistics Output](#statistics-output)
- [Metric Definitions](#metric-definitions)
- [Endpoint Analytics](#endpoint-analytics)
- [Slow API Detection](#slow-api-detection)
- [Reset Statistics](#reset-statistics)
- [API Reference](#api-reference)
- [TypeScript Usage](#typescript-usage)
- [CommonJS Usage](#commonjs-usage)
- [Testing](#testing)
- [Demo Application](#demo-application)
- [Project Architecture](#project-architecture)
- [Limitations](#limitations)
- [Security and Privacy](#security-and-privacy)
- [Contributing](#contributing)
- [License](#license)

---

## Problem Statement

Modern backend applications expose dozens or hundreds of API endpoints. Without monitoring, developers have no visibility into:

- Which endpoints are slowest.
- How many requests are failing.
- Whether error rates are increasing over time.
- What the response time distribution looks like.
- Which endpoints consume the most resources.

Production-grade monitoring tools (Datadog, New Relic, Prometheus) are powerful but complex to set up and often expensive. Many Node.js projects — especially academic, hobby, or early-stage projects — need a simple, zero-dependency way to understand their API performance.

**ApiPulse** solves this by providing a single Express middleware that automatically collects performance metrics with no external services, no database, and no configuration required.

---

## Why API Monitoring Matters

1. **Performance Visibility** — Know exactly how fast (or slow) each endpoint responds.
2. **Error Detection** — Identify failing endpoints before users report them.
3. **Capacity Planning** — Understand traffic patterns and request volumes.
4. **SLA Compliance** — Track P50 and P95 response times against your targets.
5. **Debugging** — Correlate slow requests with specific endpoints and HTTP methods.
6. **Optimization** — Focus performance work on the endpoints that matter most.

---

## Features

- ✅ **Zero-config setup** — Add one middleware line, get instant monitoring.
- ✅ **Response time tracking** — Average, min, max, P50, and P95.
- ✅ **Error rate tracking** — Client errors (4xx) and server errors (5xx).
- ✅ **Status code distribution** — Counts per status code (200, 201, 404, 500, etc.).
- ✅ **HTTP method statistics** — Breakdown by GET, POST, PUT, PATCH, DELETE, etc.
- ✅ **Endpoint analytics** — Per-endpoint request count, response time, errors, and slow requests.
- ✅ **Slow API detection** — Configurable threshold with optional callback.
- ✅ **Route pattern grouping** — Uses Express route patterns (`/users/:id`) not actual URLs.
- ✅ **Aborted request tracking** — Counts client disconnections separately.
- ✅ **Bounded memory** — Response-time percentiles use a capped sample buffer (`maxSamples`) and endpoint keys are capped by `maxEndpoints`; distribution maps grow only with the number of *distinct* status codes, methods, and routes.
- ✅ **Path exclusion** — Ignore health checks, monitoring endpoints, etc.
- ✅ **Safe snapshots** — Returned objects are copies; no internal state leakage.
- ✅ **Non-intrusive** — Never modifies the response body or interferes with Express.
- ✅ **Lightweight** — Zero production dependencies.
- ✅ **TypeScript ready** — Ships its own `.d.ts` declarations; no `@types` package required.
- ✅ **ESM and CommonJS** — Native ES modules, plus a `require` condition for recent Node versions.

---

## Technology Stack

| Technology | Purpose |
|-----------|---------|
| Node.js ≥ 18 | Runtime |
| JavaScript (ES Modules) | Language |
| TypeScript declarations | Editor/type-checking support (`src/index.d.ts`) |
| Express.js | Middleware integration (peer dependency) |
| Jest | Test framework |
| Supertest | HTTP integration testing |

---

## Installation

```bash
npm install apipulse
```

> **Note:** Express.js is a peer dependency. You must have Express installed in your project:
>
> ```bash
> npm install express
> ```

---

## Quick Start

```javascript
import express from 'express';
import { createMonitor } from 'apipulse';

const app = express();

// Create a monitor with default settings
const monitor = createMonitor();

// Add monitoring middleware (before your routes)
app.use(monitor.middleware);

// Your routes
app.get('/api/users', (req, res) => {
  res.json([{ id: 1, name: 'Alice' }]);
});

// Expose statistics (optional)
app.get('/monitor/stats', (req, res) => {
  res.json(monitor.getStats());
});

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
```

That's it. Every request to your Express app is now automatically tracked.

---

## Configuration Reference

```javascript
const monitor = createMonitor({
  slowThreshold: 1000,              // ms — requests slower than this are "slow"
  enabled: true,                     // set false to disable monitoring
  ignorePaths: ['/health', '/monitor'], // paths to exclude from tracking
  maxSamples: 1000,                  // max response time samples for percentiles
  maxEndpoints: 1000,                // max distinct endpoint keys to track
  onSlowRequest: (details) => {      // callback when a slow request is detected
    console.log('Slow:', details);
  },
});
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `slowThreshold` | `number` | `1000` | Response time threshold (ms) for classifying requests as slow. |
| `enabled` | `boolean` | `true` | Set to `false` to disable all monitoring. Requests pass through untouched. |
| `ignorePaths` | `string[]` | `[]` | Array of path prefixes to exclude from monitoring. Matching is prefix-based (e.g., `'/monitor'` ignores `/monitor/stats` and `/monitor/endpoints`). |
| `maxSamples` | `number` | `1000` | Maximum number of response time samples retained for percentile calculations. Oldest samples are evicted (FIFO) when the limit is reached. |
| `maxEndpoints` | `number` | `1000` | Maximum number of distinct endpoint keys tracked. Once reached, new endpoints are folded into a per-method `"METHOD (overflow)"` bucket instead of growing the map. Global request statistics remain exact. |
| `onSlowRequest` | `function \| null` | `null` | Callback invoked when a slow request is detected. Receives `{ method, endpoint, statusCode, responseTime }`. Exceptions in the callback are silently caught. |

All options are validated at creation time. Invalid values throw a `TypeError` with a descriptive message.

---

## Statistics Output

```javascript
const stats = monitor.getStats();
```

Example output after real traffic:

```json
{
  "totalRequests": 1000,
  "successfulRequests": 920,
  "failedRequests": 80,
  "abortedRequests": 2,
  "clientErrors": 50,
  "serverErrors": 30,
  "failureRate": 8,
  "slowRequests": 15,
  "responseTime": {
    "average": 245.50,
    "min": 1.23,
    "max": 2500.89,
    "p50": 180.45,
    "p95": 850.12
  },
  "statusCodes": {
    "200": 650,
    "201": 270,
    "400": 40,
    "404": 10,
    "500": 30
  },
  "methods": {
    "GET": 600,
    "POST": 250,
    "PUT": 100,
    "DELETE": 50
  },
  "endpoints": {
    "GET /api/users": {
      "requests": 300,
      "totalTime": 36000,
      "failed": 0,
      "slow": 5,
      "min": 10.5,
      "max": 1200.3,
      "averageResponseTime": 120
    }
  }
}
```

---

## Metric Definitions

### Top-Level Metrics

| Metric | Description |
|--------|-------------|
| `totalRequests` | Total number of completed HTTP requests (excludes aborted). |
| `successfulRequests` | Requests that returned HTTP 200–399. |
| `failedRequests` | Requests that returned HTTP 400–599. |
| `abortedRequests` | Requests where the client disconnected before the response finished. |
| `clientErrors` | Requests that returned HTTP 400–499. |
| `serverErrors` | Requests that returned HTTP 500–599. |
| `failureRate` | `(failedRequests / totalRequests) × 100`, rounded to 2 decimal places. |
| `slowRequests` | Requests whose response time exceeded `slowThreshold`. |

### Response Time Metrics

| Metric | Description |
|--------|-------------|
| `responseTime.average` | Mean response time across all completed requests (ms). |
| `responseTime.min` | Fastest response time recorded (ms). |
| `responseTime.max` | Slowest response time recorded (ms). |
| `responseTime.p50` | 50th percentile (median) — 50% of requests were faster than this. |
| `responseTime.p95` | 95th percentile — 95% of requests were faster than this. |

Percentiles are calculated from the most recent `maxSamples` response times using the nearest-rank method.

### Status Code Distribution

A plain object mapping HTTP status codes (as string keys) to their counts. Only codes that have actually been observed appear in the object.

### Method Distribution

A plain object mapping HTTP method names to their counts (e.g., `{ "GET": 100, "POST": 50 }`).

### Endpoint Statistics

Each key is `"METHOD /path"` (e.g., `"GET /api/users"`). The value contains:

| Field | Description |
|-------|-------------|
| `requests` | Total requests to this endpoint. |
| `totalTime` | Sum of all response times (ms). |
| `failed` | Requests returning 400+. |
| `slow` | Requests exceeding `slowThreshold`. |
| `min` | Fastest response time for this endpoint (ms). |
| `max` | Slowest response time for this endpoint (ms). |
| `averageResponseTime` | `totalTime / requests`, rounded to 2 decimals. |

---

## Endpoint Analytics

Retrieve per-endpoint statistics separately:

```javascript
const endpoints = monitor.getEndpointStats();
console.log(endpoints);
```

Output:

```json
{
  "GET /api/users": {
    "requests": 100,
    "totalTime": 12000,
    "failed": 5,
    "slow": 2,
    "min": 15.3,
    "max": 1500.7,
    "averageResponseTime": 120
  },
  "POST /api/users": {
    "requests": 50,
    "totalTime": 4000,
    "failed": 10,
    "slow": 0,
    "min": 20.1,
    "max": 500.2,
    "averageResponseTime": 80
  }
}
```

### Route Pattern Grouping

When you define Express routes with parameters like `/users/:id`, all requests matching that pattern (e.g., `/users/1`, `/users/42`, `/users/abc`) are grouped under a single entry `GET /users/:id` instead of creating separate entries for every unique URL. This prevents unbounded memory growth from dynamic URLs.

> **Note:** Grouping applies to requests that match a defined route. Requests that match **no** route (i.e. `404`s) fall back to the raw request path, so they are not grouped — but they cannot grow memory without limit either: the endpoint map is capped at `maxEndpoints` distinct keys (default `1000`). Once the cap is reached, any *additional* endpoint is folded into a per-method `"METHOD (overflow)"` bucket. Global figures (`totalRequests`, `statusCodes`, `methods`, `slowRequests`, response times) stay exact regardless of the cap — only the per-endpoint breakdown is aggregated. Lower `maxEndpoints` if you expose a public API to scanner traffic.

---

## Slow API Detection

Configure a threshold and optional callback:

```javascript
const monitor = createMonitor({
  slowThreshold: 1000,  // milliseconds
  onSlowRequest: (details) => {
    console.warn(`Slow API: ${details.method} ${details.endpoint} — ${details.responseTime}ms`);
    // You could also send an alert, log to a file, etc.
  },
});
```

The callback receives:

```javascript
{
  method: 'GET',           // HTTP method
  endpoint: '/api/users',  // Route pattern
  statusCode: 200,         // Response status code
  responseTime: 1523.45    // Actual response time in ms
}
```

**Safety:** If your callback throws an error, it is silently caught. The monitoring middleware will never crash your application due to a callback failure.

---

## Reset Statistics

Clear all collected metrics:

```javascript
monitor.resetStats();
```

This resets all counters, response time samples, status code distributions, method counts, and endpoint statistics back to zero. Useful for periodic stat windows or during testing.

---

## API Reference

### `createMonitor(options?)`

Creates and returns a monitor instance.

**Parameters:**
- `options` (optional) — Configuration object. See [Configuration Reference](#configuration-reference).

**Returns:** `{ middleware, getStats, getEndpointStats, resetStats }`

### `monitor.middleware`

Express middleware function. Add it with `app.use(monitor.middleware)` **before** your route handlers.

### `monitor.getStats()`

Returns a complete snapshot of all monitoring statistics. The returned object is a safe copy — modifying it does not affect the monitor's internal state.

### `monitor.getEndpointStats()`

Returns only the per-endpoint statistics. Also a safe copy.

### `monitor.resetStats()`

Resets all metrics to zero / empty.

---

## TypeScript Usage

The package ships its own TypeScript declarations (`src/index.d.ts`), so no `@types/...` package is needed. Types are picked up automatically from the `exports` map:

```ts
import express from 'express';
import { createMonitor } from 'apipulse';
import type { MonitorOptions, MonitorStats, EndpointStats } from 'apipulse';

const options: MonitorOptions = {
  slowThreshold: 500,
  maxSamples: 500,
  maxEndpoints: 500,
};

const monitor = createMonitor(options);
const app = express();
app.use(monitor.middleware);

const stats: MonitorStats = monitor.getStats();
const endpoints: Record<string, EndpointStats> = monitor.getEndpointStats();
```

Exported types:

| Type | Description |
|------|-------------|
| `MonitorOptions` | Configuration object accepted by `createMonitor`. |
| `SlowRequestDetails` | Payload passed to the `onSlowRequest` callback. |
| `Monitor` | Object returned by `createMonitor` (`middleware`, `getStats`, `getEndpointStats`, `resetStats`). |
| `MonitorStats` | Complete snapshot returned by `getStats()`. |
| `ResponseTimeStats` | The `responseTime` sub-object (average, min, max, p50, p95). |
| `EndpointStats` | Per-endpoint statistics. |
| `EndpointStatsMap` | `Record<string, EndpointStats>` returned by `getEndpointStats()`. |
| `ApiMonitorMiddleware` | Express-compatible middleware type. |

---

## CommonJS Usage

The primary, fully supported entry point is ESM (`import`). In addition, the `exports` map declares a `require` condition, so CommonJS consumers can `require()` the package on Node versions that support native `require()` of ES modules (Node ≥ 20.19 or ≥ 22.12):

```js
// CommonJS
const { createMonitor } = require('apipulse');
const express = require('express');

const monitor = createMonitor();
const app = express();
app.use(monitor.middleware);
```

> **Trade-offs:**
> - The package is authored as pure ESM and ships no compiled CommonJS build, so `require()` relies on Node's native ES-module loading rather than a bundled `.cjs` artifact (this avoids a fragile, duplicated dual-build).
> - On Node 18 and Node 20.0–20.18, `require('apipulse')` throws `ERR_REQUIRE_ESM`. Use ESM `import` there.
> - In a **TypeScript** project compiled as CommonJS (`module: "node16"`/`"nodenext"` without `"type": "module"`), TypeScript reports `TS1479` for a static `import` of this package. Use a dynamic `await import('apipulse')`, or configure the project as ESM (`.mts` / `"type": "module"`), which is fully supported.
> - ESM works on every supported Node version (≥ 18).

---

## Testing

The package includes comprehensive automated tests covering unit tests, middleware integration tests, and end-to-end scenarios.

```bash
# Install dependencies
npm install

# Run all tests
npm test
```

### Test Coverage

| Area | Tests |
|------|-------|
| Statistics functions | Percentile calculation, averages, failure rates, edge cases |
| Tracker | Recording, classification, reset, snapshot immutability, bounded memory |
| Middleware | Request tracking, error tracking, response times, slow detection, ignored paths, disabled mode |
| Integration | Full monitoring flow, self-monitoring exclusion, config validation, package exports |
| Bounded endpoints | `maxEndpoints` cap, per-method overflow bucket, global-statistic accuracy under the cap |
| Package exports | ESM `import`, CommonJS `require`, `package.json` export, declaration-file presence |

---

## Demo Application

A complete demo Express application is included in `examples/express-demo/`. It is wired into the root project as an npm workspace, so from the repository root:

```bash
npm install
npm run demo
```

Alternatively, run it from its own folder:

```bash
cd examples/express-demo
npm install
npm start
```

Then visit:

| Endpoint | Description |
|----------|-------------|
| `GET /api/success` | Returns a successful JSON response |
| `GET /api/users` | Returns sample user data |
| `POST /api/users` | Creates a user (body: `{ "name": "...", "email": "..." }`) |
| `GET /api/error` | Returns a 500 error |
| `GET /api/not-found` | Returns a 404 error |
| `GET /api/slow` | Delays response by ~2 seconds |
| `GET /monitor/stats` | Live monitoring statistics |
| `GET /monitor/endpoints` | Per-endpoint analytics |
| `POST /monitor/reset` | Reset all statistics |

See [`examples/express-demo/README.md`](examples/express-demo/README.md) for full details.

---

## Project Architecture

```
ApiPulse/
│
├── src/
│   ├── index.js          — Public entry point (re-exports createMonitor)
│   ├── index.d.ts        — TypeScript declarations for the public API
│   ├── monitor.js        — Factory function (wires config → tracker → middleware)
│   ├── config.js         — Configuration validation and defaults
│   ├── middleware.js      — Express middleware (hooks into res finish/close events)
│   ├── tracker.js        — In-memory metrics store (counters, Maps, sample buffer)
│   ├── statistics.js     — Pure math: percentiles, averages, failure rates
│   └── utils.js          — Utilities: high-res timer, safe callback, path matching
│
├── tests/
│   ├── statistics.test.js  — Unit tests for math functions
│   ├── tracker.test.js     — Unit tests for the metrics tracker
│   ├── middleware.test.js  — Express middleware integration tests
│   ├── integration.test.js — End-to-end integration tests
│   ├── endpoints.test.js   — Bounded endpoint tracking (maxEndpoints)
│   └── package.test.js     — ESM/CJS export resolution
│
├── examples/
│   └── express-demo/      — Complete demo Express application
│       ├── server.js
│       ├── package.json
│       └── README.md
│
├── package.json
├── README.md
└── LICENSE
```

### Module Responsibilities

| Module | Responsibility |
|--------|----------------|
| `index.js` | Public API surface. What consumers import. |
| `index.d.ts` | TypeScript declarations mirroring the public API. |
| `monitor.js` | Factory that creates a configured monitor instance. |
| `config.js` | Validates options, provides defaults, freezes config. |
| `middleware.js` | Express middleware that captures request lifecycle events. |
| `tracker.js` | Maintains all counters and distributions in memory. |
| `statistics.js` | Stateless math functions for percentiles and averages. |
| `utils.js` | Small utilities shared across modules. |

### Design Decisions

1. **Closures over classes** — Internal tracker state is held in closure variables, making it truly private.
2. **Frozen config** — `Object.freeze()` prevents accidental config mutation after creation.
3. **Bounded memory** — Response time samples are capped at `maxSamples` (FIFO eviction) and distinct endpoint keys are capped at `maxEndpoints`, with excess endpoints folded into per-method overflow buckets.
4. **Safe snapshots** — `getStats()` returns fresh plain objects, not references to internal Maps.
5. **Double-record guard** — Each request has a boolean flag preventing it from being counted twice if both `finish` and `close` events fire.
6. **Route pattern detection** — Uses `req.route.path` (Express route pattern) when available, falling back to `req.path` for unmatched routes (404s).

---

## Limitations

1. **In-memory only** — All metrics are stored in process memory and lost on restart. For persistent monitoring, consider forwarding stats to an external store.
2. **Single-process** — In a clustered Node.js deployment, each worker maintains its own metrics. The package does not aggregate across processes.
3. **Express only** — The middleware is designed for Express.js. Other frameworks (Koa, Fastify, Hapi) are not supported in this version.
4. **No historical data** — The package tracks current aggregates, not time-series data. For historical trends, export stats periodically.
5. **Percentile approximation** — Percentiles are computed from the most recent `maxSamples` response times, not from all requests ever. With the default of 1000 samples, this is accurate for most use cases.
6. **No automatic endpoint exposure** — The package does not automatically create a `/stats` endpoint. This is intentional — it lets the developer control access and routing.
7. **Endpoint map is capped, not unlimited** — Requests that match no Express route (404s) are keyed by their raw path, but the endpoint map is bounded by `maxEndpoints` (default `1000`); beyond that, requests are aggregated into a per-method `"METHOD (overflow)"` bucket. See [Route Pattern Grouping](#route-pattern-grouping).
8. **CommonJS requires a recent Node** — `require('apipulse')` works on Node ≥ 20.19 / ≥ 22.12 via native ES-module loading; on Node 18 use ESM `import` instead. See [CommonJS Usage](#commonjs-usage).

---

## Security and Privacy

- **No request bodies stored** — The middleware never reads or stores request or response bodies.
- **No sensitive headers logged** — Authorization headers, cookies, tokens, and passwords are never captured.
- **No automatic endpoint exposure** — Statistics are only accessible if the developer explicitly creates a route for them.
- **No external network calls** — The package operates entirely in-memory with zero network dependencies.
- **Safe callback handling** — User-provided callbacks (`onSlowRequest`) are wrapped in try/catch to prevent crashes.
- **Input validation** — All configuration options are validated at creation time with descriptive error messages.
- **Immutable snapshots** — Returned statistics objects are copies; modifying them cannot corrupt internal state.

---

## Contributing

Contributions are welcome! To contribute:

1. Fork the repository.
2. Create a feature branch: `git checkout -b feature/my-feature`.
3. Make your changes.
4. Run the tests: `npm test`.
5. Commit with a descriptive message.
6. Open a pull request.

### Development Setup

```bash
git clone https://github.com/<your-username>/ApiPulse.git
cd ApiPulse
npm install
npm test
```

### Code Style

- JavaScript ES Modules (`import` / `export`).
- Meaningful variable and function names.
- JSDoc comments for public functions.
- No unnecessary dependencies.

---

## License

[MIT](LICENSE) © 2024
