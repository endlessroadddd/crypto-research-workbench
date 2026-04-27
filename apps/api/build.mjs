import * as esbuild from 'esbuild';
import { resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

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
const bundleOutfile = resolve(__dirname, 'dist/bundle.cjs');

await esbuild.build({
  entryPoints: [resolve(__dirname, 'src/index.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: bundleOutfile,
  target: 'node22',
  sourcemap: isProd ? false : 'inline',
  minify: isProd,
  define: {
    'import.meta.url': JSON.stringify(pathToFileURL(bundleOutfile).href),
  },
  loader: {
    '.ts': 'ts',
  },
  nodePaths: nodePaths.split(':'),
  external: [
    'node:*',
    'fsevents',
  ],
});

console.log('Bundle complete → dist/bundle.cjs');
