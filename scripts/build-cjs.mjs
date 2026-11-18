/**
 * build-cjs.mjs — generates a CommonJS build of the package into dist/cjs.
 *
 * Why this exists:
 *   The package source is ESM (`"type": "module"`, `src/*.js`). The `require`
 *   export condition must resolve to a *real* CommonJS module so that
 *   `require('@krisha_2512/apipulse')` works on every supported Node version
 *   (>= 18), not just on versions that support `require()` of ES modules.
 *
 * How it works:
 *   - Each `src/*.js` file is transpiled to CommonJS with the already-present
 *     `@babel/core` + `@babel/preset-env` (no new dependencies, no bundler).
 *   - A `dist/cjs/package.json` marking `"type": "commonjs"` is emitted so the
 *     `.js` files in that folder are treated as CommonJS.
 *   - The public type declarations are copied to `dist/cjs/index.d.cts` so
 *     TypeScript projects compiled as CommonJS get correct types.
 *
 * The output targets Node 18 to match the declared `engines` range.
 */
import { transformFileSync } from '@babel/core';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = path.join(rootDir, 'src');
const outDir = path.join(rootDir, 'dist', 'cjs');

// Start from a clean directory so stale files never leak into a release.
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const jsFiles = readdirSync(srcDir).filter((file) => file.endsWith('.js'));

for (const file of jsFiles) {
  const { code } = transformFileSync(path.join(srcDir, file), {
    // Ignore the repo's babel.config.json; use an explicit, reproducible config.
    configFile: false,
    babelrc: false,
    presets: [
      [
        '@babel/preset-env',
        { targets: { node: '18' }, modules: 'commonjs' },
      ],
    ],
    comments: true,
    sourceMaps: false,
  });

  writeFileSync(path.join(outDir, file), `${code}\n`);
}

// Mark the folder as CommonJS regardless of the root package "type".
writeFileSync(
  path.join(outDir, 'package.json'),
  `${JSON.stringify({ type: 'commonjs' }, null, 2)}\n`
);

// Ship CommonJS-flavoured type declarations next to the CJS build.
const declarations = path.join(srcDir, 'index.d.ts');
if (existsSync(declarations)) {
  copyFileSync(declarations, path.join(outDir, 'index.d.cts'));
}

console.log(`[build-cjs] wrote ${jsFiles.length} CommonJS modules to dist/cjs`);
