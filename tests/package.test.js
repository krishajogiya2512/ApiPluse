/**
 * package.test.js — verifies how the package resolves for consumers.
 *
 * These tests spawn real child Node processes (instead of importing through
 * Jest's transform) so that Node's actual package resolution — the `exports`
 * map, self-reference, and ESM/CJS interop — is exercised exactly as a
 * consumer would experience it.
 */
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();

function runNode(args) {
  return execFileSync(process.execPath, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/** True when this Node version enables `require()` of ES modules by default. */
function supportsRequireEsm() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major > 22) return true;
  if (major === 22) return minor >= 12;
  if (major === 20) return minor >= 19;
  return false;
}

describe('package exports — module resolution', () => {
  test('ESM: `import` resolves createMonitor from the package name', () => {
    const out = runNode([
      '--input-type=module',
      '-e',
      "import { createMonitor } from 'apipulse'; process.stdout.write(typeof createMonitor);",
    ]);
    expect(out.trim()).toBe('function');
  });

  test('package.json is exposed via the exports map', () => {
    const out = runNode([
      '-e',
      "process.stdout.write(require('apipulse/package.json').name);",
    ]);
    expect(out.trim()).toBe('apipulse');
  });

  test('CommonJS: `require` resolves createMonitor (Node with require(esm))', () => {
    if (!supportsRequireEsm()) {
      // Node < 20.19 / < 22.12 cannot require() an ES module. The package
      // remains ESM-only for those versions (documented trade-off).
      return;
    }
    const out = runNode([
      '-e',
      "const { createMonitor } = require('apipulse'); process.stdout.write(typeof createMonitor);",
    ]);
    expect(out.trim()).toBe('function');
  });

  test('CJS and ESM entry points expose the same API surface', () => {
    const esm = runNode([
      '--input-type=module',
      '-e',
      "import * as m from 'apipulse'; process.stdout.write(Object.keys(m).sort().join(','));",
    ]);
    expect(esm.trim()).toBe('createMonitor');
    if (supportsRequireEsm()) {
      const cjs = runNode([
        '-e',
        "process.stdout.write(Object.keys(require('apipulse')).sort().join(','));",
      ]);
      expect(cjs.trim()).toBe('createMonitor');
    }
  });

  test('TypeScript declarations file is present', () => {
    const out = runNode(['-e', "process.stdout.write(String(require('fs').existsSync('src/index.d.ts')))"]);
    expect(out.trim()).toBe('true');
  });
});
