# ApiPulse — Express Demo

A sample Express.js application that demonstrates how to integrate and use `apipulse` for real-time API monitoring.

## Setup

```bash
cd examples/express-demo
npm install
npm start
```

The server starts on `http://localhost:3000` by default. Set the `PORT` environment variable to change it.

## Available Endpoints

### API Endpoints (Monitored)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/success` | Returns a successful JSON response |
| GET | `/api/users` | Returns sample user data |
| POST | `/api/users` | Creates a user (body: `{ "name": "...", "email": "..." }`) |
| GET | `/api/error` | Intentionally returns a 500 error |
| GET | `/api/not-found` | Returns a 404 error |
| GET | `/api/slow` | Intentionally delays the response by ~2 seconds |

### Monitoring Endpoints (Not Monitored)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/monitor/stats` | Returns live monitoring statistics |
| GET | `/monitor/endpoints` | Returns endpoint-wise analytics |
| POST | `/monitor/reset` | Resets all monitoring statistics |

## Usage Example

1. Start the server:
   ```bash
   npm start
   ```

2. Send some requests:
   ```bash
   curl http://localhost:3000/api/success
   curl http://localhost:3000/api/users
   curl http://localhost:3000/api/error
   curl http://localhost:3000/api/slow
   ```

3. View statistics:
   ```bash
   curl http://localhost:3000/monitor/stats | json_pp
   ```

4. View endpoint analytics:
   ```bash
   curl http://localhost:3000/monitor/endpoints | json_pp
   ```

5. Reset statistics:
   ```bash
   curl -X POST http://localhost:3000/monitor/reset
   ```

## Monitor Configuration

The demo uses the following configuration:

```javascript
const monitor = createMonitor({
  slowThreshold: 1000,            // Requests > 1000ms are "slow"
  ignorePaths: ['/monitor'],      // Exclude monitoring endpoints
  maxSamples: 1000,               // Keep 1000 response time samples
  onSlowRequest: (details) => {   // Log slow requests to console
    console.warn(`Slow API: ${details.method} ${details.endpoint}`);
  },
});
```

The monitoring endpoints (`/monitor/*`) are excluded from metrics via `ignorePaths`, so they don't inflate the request count or affect statistics.
