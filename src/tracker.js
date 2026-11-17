import { calcPercentile, calcAverage, calcFailureRate } from './statistics.js';

/**
 * createTracker — creates an in-memory metrics tracker.
 *
 * All state is held in closure variables — there's no way to access or
 * mutate internal data except through the returned API.
 *
 * Memory safety:
 *  - responseSamples is a bounded array (FIFO eviction at maxSamples).
 *  - statusCodes and methods Maps grow proportionally to the number of
 *    *distinct* values, which is inherently small and bounded.
 *  - endpoints is bounded by maxEndpoints distinct keys. Once the limit is
 *    reached, any *new* endpoint is folded into a per-method overflow bucket
 *    (key: "METHOD (overflow)"), so unmatched/404 URLs cannot grow memory
 *    without limit. Global counters are always updated regardless of the cap.
 *
 * @param {object} config - Frozen config from createConfig().
 * @returns {object} tracker API
 */
export function createTracker(config) {
  // --- internal counters ---
  let totalRequests = 0;
  let successfulRequests = 0;
  let failedRequests = 0;
  let abortedRequests = 0;
  let clientErrors = 0;
  let serverErrors = 0;
  let slowRequests = 0;

  // --- response time aggregation ---
  let totalResponseTime = 0;
  let minResponseTime = Infinity;
  let maxResponseTime = -Infinity;

  // Bounded ring buffer for percentile calculation.
  // When the array exceeds maxSamples, the oldest entry is evicted.
  let responseSamples = [];

  // --- distribution Maps ---
  const statusCodes = new Map();
  const methods = new Map();

  // Endpoint key format: "METHOD /path" (e.g. "GET /users")
  // Value: { requests, totalTime, failed, slow, min, max }
  // Bounded by config.maxEndpoints; overflow entries use "METHOD (overflow)".
  const endpoints = new Map();

  /**
   * makeEndpointEntry — a zeroed per-endpoint accumulator.
   */
  function makeEndpointEntry() {
    return {
      requests: 0,
      totalTime: 0,
      failed: 0,
      slow: 0,
      min: Infinity,
      max: -Infinity,
    };
  }

  /**
   * record — called by middleware when a response finishes normally.
   * Updates every aggregate in a single pass.
   */
  function record({ method, endpoint, statusCode, responseTime, isSlow }) {
    totalRequests++;

    // --- classify by status code ---
    if (statusCode >= 200 && statusCode <= 399) {
      successfulRequests++;
    } else if (statusCode >= 400 && statusCode <= 499) {
      failedRequests++;
      clientErrors++;
    } else if (statusCode >= 500 && statusCode <= 599) {
      failedRequests++;
      serverErrors++;
    }

    // --- status code distribution ---
    statusCodes.set(statusCode, (statusCodes.get(statusCode) ?? 0) + 1);

    // --- HTTP method distribution ---
    methods.set(method, (methods.get(method) ?? 0) + 1);

    // --- per-endpoint stats (bounded) ---
    // Key combines method + endpoint so GET /users ≠ POST /users.
    // If the endpoints map is already at capacity and this is a *new* key,
    // fold the request into a per-method overflow bucket instead of growing
    // the map. Global counters above are always updated first, so totals,
    // status codes, methods, slow counts, and response times stay accurate
    // even when the endpoint limit is reached.
    const epKey = `${method} ${endpoint}`;
    let endpointKey = epKey;
    if (!endpoints.has(epKey) && endpoints.size >= config.maxEndpoints) {
      endpointKey = `${method} (overflow)`;
    }
    if (!endpoints.has(endpointKey)) {
      endpoints.set(endpointKey, makeEndpointEntry());
    }
    const ep = endpoints.get(endpointKey);
    ep.requests++;
    ep.totalTime += responseTime;
    if (statusCode >= 400) ep.failed++;
    if (isSlow) ep.slow++;
    if (responseTime < ep.min) ep.min = responseTime;
    if (responseTime > ep.max) ep.max = responseTime;

    // --- response time tracking ---
    responseSamples.push(responseTime);
    if (responseSamples.length > config.maxSamples) {
      responseSamples.shift(); // FIFO eviction — bounded memory
    }
    totalResponseTime += responseTime;
    if (responseTime < minResponseTime) minResponseTime = responseTime;
    if (responseTime > maxResponseTime) maxResponseTime = responseTime;

    // --- slow request counter ---
    if (isSlow) slowRequests++;
  }

  /**
   * recordAbort — called by middleware when the client closes the connection
   * before the response finishes.  Only increments the abort counter.
   */
  function recordAbort({ method, endpoint }) {
    abortedRequests++;
  }

  /**
   * getSnapshot — returns a safe, deep-copied summary of all metrics.
   *
   * The returned object is a plain-object tree with no references to
   * internal state.  Callers can mutate it freely without affecting
   * the tracker.
   */
  function getSnapshot() {
    // Percentiles require a sorted copy of the sample buffer
    const sorted = [...responseSamples].sort((a, b) => a - b);
    const n = sorted.length;

    const p50 = n > 0 ? calcPercentile(sorted, 0.50) : 0;
    const p95 = n > 0 ? calcPercentile(sorted, 0.95) : 0;

    // Convert Maps to plain objects (safe copies)
    const statusCodesObj = Object.fromEntries(statusCodes);
    const methodsObj = Object.fromEntries(methods);

    // Deep copy of endpoint stats
    const endpointsObj = {};
    for (const [key, val] of endpoints) {
      endpointsObj[key] = {
        ...val,
        averageResponseTime: calcAverage(val.totalTime, val.requests),
        min: val.min === Infinity ? 0 : val.min,
        max: val.max === -Infinity ? 0 : val.max,
      };
    }

    return {
      totalRequests,
      successfulRequests,
      failedRequests,
      abortedRequests,
      clientErrors,
      serverErrors,
      failureRate: calcFailureRate(failedRequests, totalRequests),
      slowRequests,
      responseTime: {
        average: calcAverage(totalResponseTime, totalRequests),
        min: minResponseTime === Infinity ? 0 : minResponseTime,
        max: maxResponseTime === -Infinity ? 0 : maxResponseTime,
        p50,
        p95,
      },
      statusCodes: statusCodesObj,
      methods: methodsObj,
      endpoints: endpointsObj,
    };
  }

  /**
   * reset — clears all metrics back to zero/empty.
   * Useful for periodic stat windows or test isolation.
   */
  function reset() {
    totalRequests = 0;
    successfulRequests = 0;
    failedRequests = 0;
    abortedRequests = 0;
    clientErrors = 0;
    serverErrors = 0;
    slowRequests = 0;
    totalResponseTime = 0;
    minResponseTime = Infinity;
    maxResponseTime = -Infinity;
    responseSamples = [];
    statusCodes.clear();
    methods.clear();
    endpoints.clear();
  }

  /**
   * getEndpoints — returns a safe copy of per-endpoint stats only.
   */
  function getEndpoints() {
    const result = {};
    for (const [key, val] of endpoints) {
      result[key] = {
        ...val,
        averageResponseTime: calcAverage(val.totalTime, val.requests),
        min: val.min === Infinity ? 0 : val.min,
        max: val.max === -Infinity ? 0 : val.max,
      };
    }
    return result;
  }

  return { record, recordAbort, getSnapshot, reset, getEndpoints };
}
