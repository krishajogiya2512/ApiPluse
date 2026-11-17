import { now, safeCall, isIgnored } from './utils.js';

/**
 * createMiddleware — returns Express middleware that records request metrics.
 *
 * How it works:
 *  1. When a request arrives, the middleware checks if monitoring is enabled
 *     and if the path is in the ignore list.  If either check fails, it calls
 *     next() immediately.
 *  2. It captures a high-resolution start time (performance.now()).
 *  3. It attaches listeners for two Response events:
 *       - 'finish' — fires when the response has been fully sent to the OS.
 *       - 'close'  — fires when the underlying connection closes.
 *     If the response completes normally, 'finish' fires first and we record
 *     the full metric.  If the client disconnects early, 'close' fires first
 *     (without 'finish') and we record an abort.
 *  4. A `recorded` boolean guards against double-counting when both events fire.
 *  5. The middleware calls next() synchronously and never modifies the response.
 *
 * Route pattern detection:
 *  Express populates `req.route.path` *after* the route handler runs, so by
 *  the time 'finish' fires, `req.route?.path` contains the pattern
 *  (e.g. "/users/:id") rather than the actual URL (e.g. "/users/42").
 *  When no route is matched (404), we fall back to `req.path`.
 *
 * @param {object} tracker - Tracker instance from createTracker().
 * @param {object} config  - Frozen config from createConfig().
 * @returns {Function} Express middleware (req, res, next)
 */
export function createMiddleware(tracker, config) {
  return function apiMonitorMiddleware(req, res, next) {
    // 1. Disabled — pass through without any overhead
    if (!config.enabled) {
      return next();
    }

    // 2. Ignored path — pass through
    if (isIgnored(req.path, config.ignorePaths)) {
      return next();
    }

    // 3. Start high-resolution timer
    const startTime = now();

    // 4. Guard against double-recording (finish + close can both fire)
    let recorded = false;

    /**
     * onFinish — fires when the response has been fully written.
     * This is the normal completion path.
     */
    function onFinish() {
      if (recorded) return;
      recorded = true;

      // Clean up the other listener
      res.removeListener('close', onClose);

      const responseTime = now() - startTime;
      const isSlow = responseTime >= config.slowThreshold;

      // Prefer req.route.path (Express route pattern) over req.path (actual URL)
      const endpoint = req.route?.path ?? req.path;

      tracker.record({
        method: req.method,
        endpoint,
        statusCode: res.statusCode,
        responseTime,
        isSlow,
      });

      // Fire slow-request callback (if configured and applicable)
      if (isSlow) {
        safeCall(config.onSlowRequest, {
          method: req.method,
          endpoint,
          statusCode: res.statusCode,
          responseTime,
        });
      }
    }

    /**
     * onClose — fires when the underlying connection closes.
     * If 'finish' already fired, `recorded` is true and this is a no-op.
     * If 'finish' has NOT fired, the client disconnected early (abort).
     */
    function onClose() {
      if (recorded) return;
      recorded = true;

      // Clean up the other listener
      res.removeListener('finish', onFinish);

      tracker.recordAbort({
        method: req.method,
        endpoint: req.route?.path ?? req.path,
      });
    }

    // 5. Attach event listeners
    res.on('finish', onFinish);
    res.on('close', onClose);

    // 6. Continue to the next middleware / route handler
    next();
  };
}
