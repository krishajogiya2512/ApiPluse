/**
 * statistics.test.js — unit tests for the pure math functions.
 *
 * These are stateless functions, so we can test them in complete isolation
 * without any Express or middleware setup.
 */
import { calcPercentile, calcAverage, calcFailureRate } from '../src/statistics.js';

// ─── calcPercentile ──────────────────────────────────────────────────────────

describe('calcPercentile', () => {
  test('returns 0 for an empty array', () => {
    expect(calcPercentile([], 0.5)).toBe(0);
  });

  test('returns 0 for null input', () => {
    expect(calcPercentile(null, 0.5)).toBe(0);
  });

  test('returns 0 for undefined input', () => {
    expect(calcPercentile(undefined, 0.95)).toBe(0);
  });

  test('returns the only element for a single-element array', () => {
    expect(calcPercentile([42], 0.5)).toBe(42);
    expect(calcPercentile([42], 0.95)).toBe(42);
  });

  test('P50 of [10, 20, 30, 40, 50, 60, 70, 80, 90, 100] returns 50', () => {
    // 10 elements, P50 → ceil(10 × 0.5) - 1 = 4 → sorted[4] = 50
    const sorted = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    expect(calcPercentile(sorted, 0.50)).toBe(50);
  });

  test('P95 of [10, 20, 30, 40, 50, 60, 70, 80, 90, 100] returns 100', () => {
    // 10 elements, P95 → ceil(10 × 0.95) - 1 = 9 → sorted[9] = 100
    const sorted = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    expect(calcPercentile(sorted, 0.95)).toBe(100);
  });

  test('P95 of 20 elements returns the 19th element', () => {
    // 20 elements, P95 → ceil(20 × 0.95) - 1 = 18 → sorted[18]
    const sorted = Array.from({ length: 20 }, (_, i) => (i + 1) * 10);
    // sorted = [10, 20, ..., 200]
    expect(calcPercentile(sorted, 0.95)).toBe(190); // index 18 = 190
  });

  test('P50 of two elements returns the first', () => {
    // 2 elements, P50 → ceil(2 × 0.5) - 1 = 0 → sorted[0]
    expect(calcPercentile([10, 20], 0.50)).toBe(10);
  });

  test('P95 of two elements returns the second', () => {
    // 2 elements, P95 → ceil(2 × 0.95) - 1 = 1 → sorted[1]
    expect(calcPercentile([10, 20], 0.95)).toBe(20);
  });
});

// ─── calcAverage ─────────────────────────────────────────────────────────────

describe('calcAverage', () => {
  test('returns 0 when count is 0', () => {
    expect(calcAverage(100, 0)).toBe(0);
  });

  test('returns 0 when count is null', () => {
    expect(calcAverage(100, null)).toBe(0);
  });

  test('returns 0 when count is undefined', () => {
    expect(calcAverage(100, undefined)).toBe(0);
  });

  test('calculates correct average', () => {
    expect(calcAverage(300, 3)).toBe(100);
  });

  test('rounds to 2 decimal places', () => {
    expect(calcAverage(100, 3)).toBe(33.33);
  });

  test('handles single request', () => {
    expect(calcAverage(42.5, 1)).toBe(42.5);
  });
});

// ─── calcFailureRate ─────────────────────────────────────────────────────────

describe('calcFailureRate', () => {
  test('returns 0 when total is 0', () => {
    expect(calcFailureRate(5, 0)).toBe(0);
  });

  test('returns 0 when total is null', () => {
    expect(calcFailureRate(5, null)).toBe(0);
  });

  test('returns 0 when no failures', () => {
    expect(calcFailureRate(0, 100)).toBe(0);
  });

  test('calculates correct failure rate', () => {
    expect(calcFailureRate(10, 100)).toBe(10);
  });

  test('calculates 100% failure', () => {
    expect(calcFailureRate(50, 50)).toBe(100);
  });

  test('rounds to 2 decimal places', () => {
    expect(calcFailureRate(1, 3)).toBe(33.33);
  });
});
