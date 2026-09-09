import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const out = resolve(root, 'frontend/node_modules/.cache/f1nancer-tests/sync.test.mjs');
await build({ entryPoints: [resolve(root, 'packages/domain/tests/sync.test.ts')], outfile: out, bundle: true, platform: 'node', format: 'esm', packages: 'external', logLevel: 'warning' });
const result = spawnSync(process.execPath, ['--test', out], { cwd: root, stdio: 'inherit' });
process.exitCode = result.status ?? 1;
