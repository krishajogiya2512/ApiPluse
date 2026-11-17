/**
 * calcPercentile — nearest-rank percentile on a pre-sorted array.
 *
 * Uses the standard nearest-rank method:
 *   index = ceil(N × p) − 1
 *
 * For example, P95 on 100 elements → index 94 (the 95th value).
 * P50 on 10 elements → index 4 (the 5th value, i.e. the median).
 *
 * @param {number[]} sortedArr - Already sorted (ascending) array of numbers.
 * @param {number} percentile  - Fraction between 0 and 1 (e.g. 0.95 for P95).
 * @returns {number} The value at the computed percentile, or 0 for empty input.
 */
export function calcPercentile(sortedArr, percentile) {
  if (!sortedArr || sortedArr.length === 0) return 0;
  const idx = Math.min(
    Math.ceil(sortedArr.length * percentile) - 1,
    sortedArr.length - 1
  );
  return sortedArr[Math.max(idx, 0)];
}

/**
 * calcAverage — returns total / count rounded to 2 decimal places, or 0.
 * @param {number} total
 * @param {number} count
 * @returns {number}
 */
export function calcAverage(total, count) {
  if (!count || count === 0) return 0;
  return parseFloat((total / count).toFixed(2));
}

/**
 * calcFailureRate — returns (failed / total × 100) rounded to 2 decimal places, or 0.
 * @param {number} failed
 * @param {number} total
 * @returns {number}
 */
export function calcFailureRate(failed, total) {
  if (!total || total === 0) return 0;
  return parseFloat(((failed / total) * 100).toFixed(2));
}
