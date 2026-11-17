import { createConfig } from './config.js';
import { createTracker } from './tracker.js';
import { createMiddleware } from './middleware.js';

/**
 * createMonitor — entry point. Creates a configured monitor instance.
 * @param {object} options
 * @returns {{ middleware, getStats, getEndpointStats, resetStats }}
 */
export function createMonitor(options = {}) {
  const config = createConfig(options);
  const tracker = createTracker(config);
  const middleware = createMiddleware(tracker, config);
  return {
    middleware,
    getStats: () => tracker.getSnapshot(),
    getEndpointStats: () => tracker.getEndpoints(),
    resetStats: () => tracker.reset(),
  };
}
