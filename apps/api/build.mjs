import * as esbuild from 'esbuild';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const workspaceRoot = resolve(__dirname, '../../');

// Resolve @research/* packages from workspace packages/
const nodePaths = [
  resolve(workspaceRoot, 'packages/adapters/dist'),
  resolve(workspaceRoot, 'packages/assistant/dist'),
  resolve(workspaceRoot, 'packages/core/dist'),
  resolve(workspaceRoot, 'packages/replay/dist'),
  resolve(workspaceRoot, 'packages/review/dist'),
  resolve(workspaceRoot, 'packages/storage/dist'),
].join(':');

const isProd = process.env.NODE_ENV === 'production';

await esbuild.build({
  entryPoints: [resolve(__dirname, 'src/index.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: resolve(__dirname, 'dist/bundle.js'),
  target: 'node22',
  sourcemap: isProd ? false : 'inline',
  minify: isProd,
  loader: {
    '.ts': 'ts',
  },
  nodePaths: nodePaths.split(':'),
  external: [
    'node:fs', 'node:path', 'node:url', 'node:module', 'node:process',
    'fsevents', 'async_hooks',
  ],
});

console.log('Bundle complete → dist/bundle.js');
