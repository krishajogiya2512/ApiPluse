import { performance } from 'perf_hooks';

/**
 * now() — high-resolution timestamp via performance.now()
 * @returns {number}
 */
export function now() {
  return performance.now();
}

/**
 * safeCall — calls fn(arg) in a try/catch, swallowing any errors.
 * @param {Function|null} fn
 * @param {*} arg
 */
export function safeCall(fn, arg) {
  if (typeof fn !== 'function') return;
  try {
    fn(arg);
  } catch (_) {
    // swallow
  }
}

/**
 * isIgnored — returns true if path starts with any entry in ignorePaths.
 * @param {string} path
 * @param {string[]} ignorePaths
 * @returns {boolean}
 */
export function isIgnored(path, ignorePaths) {
  if (!Array.isArray(ignorePaths) || ignorePaths.length === 0) return false;
  return ignorePaths.some((prefix) => path.startsWith(prefix));
}
