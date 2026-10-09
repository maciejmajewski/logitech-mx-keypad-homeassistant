import { postBuildProcessing, unlinkPlugin } from '@logitech/plugin-toolkit';
import { esmShimPlugin } from '@logitech/plugin-toolkit/esbuild';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'tsup';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === 'production';
const isWatch = process.argv.includes('--watch') || process.argv.includes('-w');

export default defineConfig({
  entry: ['index.ts'],
  format: ['esm'],
  outDir: 'dist',
  outExtension: () => ({ js: '.mjs' }),
  clean: true,
  bundle: true,
  platform: 'node',
  target: 'es2022',
  noExternal: [/.*/],
  minify: isProduction,
  sourcemap: !isProduction,
  shims: true,
  esbuildPlugins: [esmShimPlugin({ require: true })],
  watch: isWatch,
  onSuccess: async () => {
    // Copies package/ into dist/ and, in watch mode, links dist/ into the
    // Logi Plugin Service plugin folder and asks it to reload.
    await postBuildProcessing(__dirname, isWatch);
    if (isWatch) console.log('Watching for changes. Press Ctrl+C to stop.');
  },
});

if (isWatch) {
  const cleanup = async () => {
    try {
      await unlinkPlugin(true);
    } catch (error) {
      console.warn('Failed to unlink plugin:', (error as Error).message);
    }
    process.exit(0);
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}
