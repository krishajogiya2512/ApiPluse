/**
 * Type definitions for api-monitor-lite.
 *
 * These declarations describe the public API exported from
 * `src/index.js`. They intentionally avoid depending on `@types/express`;
 * the middleware uses structurally permissive parameter types so it can be
 * passed directly to `app.use(...)` in any Express version.
 */

/**
 * Details passed to the `onSlowRequest` callback when a request's response
 * time is greater than or equal to `slowThreshold`.
 */
export interface SlowRequestDetails {
  /** HTTP method, e.g. `"GET"`. */
  method: string;
  /**
   * Express route pattern (e.g. `"/users/:id"`) when the request matched a
   * route, otherwise the raw request path for unmatched requests.
   */
  endpoint: string;
  /** Response status code. */
  statusCode: number;
  /** Actual response time in milliseconds. */
  responseTime: number;
}

/**
 * Configuration options accepted by {@link createMonitor}. All fields are
 * optional and fall back to the documented defaults.
 */
export interface MonitorOptions {
  /**
   * Response time threshold in milliseconds. Requests taking longer are
   * classified as slow. Default: `1000`.
   */
  slowThreshold?: number;
  /** Set to `false` to disable monitoring entirely. Default: `true`. */
  enabled?: boolean;
  /**
   * List of path prefixes to exclude from monitoring.
   * Default: `[]`.
   */
  ignorePaths?: string[];
  /**
   * Maximum number of response-time samples retained for percentile
   * calculation (FIFO eviction). Default: `1000`.
   */
  maxSamples?: number;
  /**
   * Maximum number of distinct endpoint keys tracked. Once reached, new
   * endpoints are folded into a per-method `"METHOD (overflow)"` bucket.
   * Default: `1000`.
   */
  maxEndpoints?: number;
  /**
   * Callback invoked for every slow request. Exceptions thrown inside the
   * callback are swallowed and never crash the host application.
   * Default: `null`.
   */
  onSlowRequest?: ((details: SlowRequestDetails) => void) | null;
}

/** Aggregate response-time metrics. All values are in milliseconds. */
export interface ResponseTimeStats {
  /** Mean response time across all completed requests. */
  average: number;
  /** Fastest observed response time. */
  min: number;
  /** Slowest observed response time. */
  max: number;
  /** 50th percentile (median). */
  p50: number;
  /** 95th percentile. */
  p95: number;
}

/** Per-endpoint statistics for a single `"METHOD /path"` key. */
export interface EndpointStats {
  /** Total requests recorded for this endpoint. */
  requests: number;
  /** Sum of all response times (ms). */
  totalTime: number;
  /** Requests that returned HTTP 400 or greater. */
  failed: number;
  /** Requests that exceeded `slowThreshold`. */
  slow: number;
  /** Fastest response time for this endpoint (ms). */
  min: number;
  /** Slowest response time for this endpoint (ms). */
  max: number;
  /** `totalTime / requests`, rounded to 2 decimals. */
  averageResponseTime: number;
}

/** Map of `"METHOD /path"` keys to their {@link EndpointStats}. */
export type EndpointStatsMap = Record<string, EndpointStats>;

/** Complete monitoring snapshot returned by {@link Monitor.getStats}. */
export interface MonitorStats {
  /** Total completed requests (excludes aborted requests). */
  totalRequests: number;
  /** Requests that returned HTTP 200–399. */
  successfulRequests: number;
  /** Requests that returned HTTP 400–599. */
  failedRequests: number;
  /** Requests where the client disconnected before completion. */
  abortedRequests: number;
  /** Requests that returned HTTP 400–499. */
  clientErrors: number;
  /** Requests that returned HTTP 500–599. */
  serverErrors: number;
  /** `(failedRequests / totalRequests) * 100`, rounded to 2 decimals. */
  failureRate: number;
  /** Requests whose response time exceeded `slowThreshold`. */
  slowRequests: number;
  /** Aggregate response-time metrics. */
  responseTime: ResponseTimeStats;
  /** Counts keyed by HTTP status code (as a string). */
  statusCodes: Record<string, number>;
  /** Counts keyed by HTTP method. */
  methods: Record<string, number>;
  /** Per-endpoint analytics keyed by `"METHOD /path"`. */
  endpoints: EndpointStatsMap;
}

/**
 * Express-compatible middleware function.
 *
 * Parameter types are intentionally permissive (`any`) to stay compatible
 * with every Express major version and to avoid a hard dependency on
 * `@types/express`.
 */
export type ApiMonitorMiddleware = (
  req: any,
  res: any,
  next: (err?: any) => void
) => any;

/** Object returned by {@link createMonitor}. */
export interface Monitor {
  /** Add with `app.use(monitor.middleware)` before your routes. */
  middleware: ApiMonitorMiddleware;
  /** Returns a complete, safe (deep-copied) statistics snapshot. */
  getStats(): MonitorStats;
  /** Returns only the per-endpoint statistics (safe copy). */
  getEndpointStats(): EndpointStatsMap;
  /** Resets all collected metrics to zero / empty. */
  resetStats(): void;
}

/**
 * Creates and returns a monitor instance.
 *
 * @param options - Optional configuration. Invalid values throw a `TypeError`.
 */
export function createMonitor(options?: MonitorOptions): Monitor;
