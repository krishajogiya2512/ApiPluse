/**
 * package.test.js — verifies how the package resolves for consumers.
 *
 * These tests spawn real child Node processes (instead of importing through
 * Jest's transform) so that Node's actual package resolution — the `exports`
 * map, self-reference, and ESM/CJS interop — is exercised exactly as a
 * consumer would experience it.
 *
 * The package declares `engines.node >= 18` and dual `import`/`require`
 * exports. Node 18 cannot `require()` an ES module, so the CommonJS tests
 * run with `--no-experimental-require-module` to prove the `require` entry
 * point is a real CommonJS build rather than a fallback that only works on
 * newer Node versions.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const PKG = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const NAME = PKG.name;

function runNode(args) {
  return execFileSync(process.execPath, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

// Simulates a runtime without `require()`-of-ESM (i.e. Node 18 behaviour).
const NO_REQUIRE_ESM = '--no-experimental-require-module';

describe('package exports — module resolution', () => {
  test('ESM: `import` resolves createMonitor from the package name', () => {
    const out = runNode([
      '--input-type=module',
      '-e',
      `import { createMonitor } from '${NAME}'; process.stdout.write(typeof createMonitor);`,
    ]);
    expect(out.trim()).toBe('function');
  });

  test('CJS: `require` resolves createMonitor without require(esm) support', () => {
    const out = runNode([
      NO_REQUIRE_ESM,
      '-e',
      `const { createMonitor } = require('${NAME}'); process.stdout.write(typeof createMonitor);`,
    ]);
    expect(out.trim()).toBe('function');
  });

  test('CJS: `require` resolves to the compiled CommonJS build', () => {
    const out = runNode([
      NO_REQUIRE_ESM,
      '-e',
      `process.stdout.write(require.resolve('${NAME}'));`,
    ]);
    expect(path.normalize(out.trim())).toContain(path.join('dist', 'cjs', 'index.js'));
  });

  test('ESM: `import` resolves to the ESM source', () => {
    const out = runNode([
      '--input-type=module',
      '-e',
      `process.stdout.write(import.meta.resolve('${NAME}'));`,
    ]);
    expect(out).toContain(path.join('src', 'index.js'));
    expect(out).not.toContain(path.join('dist', 'cjs'));
  });

  test('package.json is exposed via the exports map', () => {
    const out = runNode([
      '-e',
      `process.stdout.write(require('${NAME}/package.json').name);`,
    ]);
    expect(out.trim()).toBe(NAME);
  });

  test('CJS and ESM entry points expose the same API surface', () => {
    const esm = runNode([
      '--input-type=module',
      '-e',
      `import * as m from '${NAME}'; process.stdout.write(Object.keys(m).sort().join(','));`,
    ]);
    const cjs = runNode([
      NO_REQUIRE_ESM,
      '-e',
      `process.stdout.write(Object.keys(require('${NAME}')).filter((k) => k !== '__esModule').sort().join(','));`,
    ]);
    expect(esm.trim()).toBe('createMonitor');
    expect(cjs.trim()).toBe(esm.trim());
  });

  test('TypeScript declarations exist for both module systems', () => {
    const esmTypes = path.join(ROOT, 'src', 'index.d.ts');
    const cjsTypes = path.join(ROOT, 'dist', 'cjs', 'index.d.cts');
    expect(PKG.types).toBe('./src/index.d.ts');
    expect(PKG.exports['.'].import.types).toBe('./src/index.d.ts');
    expect(PKG.exports['.'].require.types).toBe('./dist/cjs/index.d.cts');
    const exists = (p) =>
      runNode(['-e', `process.stdout.write(String(require('fs').existsSync(${JSON.stringify(p)})))`]).trim();
    expect(exists(esmTypes)).toBe('true');
    expect(exists(cjsTypes)).toBe('true');
  });
});
