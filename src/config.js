const DEFAULTS = {
  slowThreshold: 1000,
  enabled: true,
  ignorePaths: [],
  maxSamples: 1000,
  maxEndpoints: 1000,
  onSlowRequest: null,
};

/**
 * createConfig — validates and merges user options with defaults.
 * Returns a frozen config object.
 * @param {object} options
 * @returns {Readonly<object>}
 */
export function createConfig(options = {}) {
  if (options !== null && typeof options !== 'object') {
    throw new TypeError('options must be a plain object');
  }

  const merged = { ...DEFAULTS, ...options };

  // Validate types
  // Number.isFinite rejects NaN and ±Infinity, which satisfy `typeof === 'number'`.
  if (!Number.isFinite(merged.slowThreshold) || merged.slowThreshold < 0) {
    throw new TypeError(
      `slowThreshold must be a non-negative finite number, got: ${String(merged.slowThreshold)}`
    );
  }
  if (typeof merged.enabled !== 'boolean') {
    throw new TypeError(
      `enabled must be a boolean, got: ${JSON.stringify(merged.enabled)}`
    );
  }
  if (!Array.isArray(merged.ignorePaths)) {
    throw new TypeError(
      `ignorePaths must be an array, got: ${JSON.stringify(merged.ignorePaths)}`
    );
  }
  if (!Number.isFinite(merged.maxSamples) || merged.maxSamples < 1) {
    throw new TypeError(
      `maxSamples must be a positive finite number, got: ${String(merged.maxSamples)}`
    );
  }
  if (!Number.isFinite(merged.maxEndpoints) || merged.maxEndpoints < 1) {
    throw new TypeError(
      `maxEndpoints must be a positive finite number, got: ${String(merged.maxEndpoints)}`
    );
  }
  if (merged.onSlowRequest !== null && typeof merged.onSlowRequest !== 'function') {
    throw new TypeError(
      `onSlowRequest must be a function or null, got: ${typeof merged.onSlowRequest}`
    );
  }

  return Object.freeze(merged);
}
