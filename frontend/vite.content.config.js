import { defineConfig } from 'vite';
import { resolve } from 'path';

/**
 * Dedicated build for the content script.
 *
 * The content script is loaded as a CLASSIC (non-module) script by the
 * manifest, so it must be a single self-contained IIFE with no `import`s.
 * Building it on its own (separate from popup/background) lets it freely
 * share modules (e.g. src/shared/field-classification.js) with the other
 * bundles: each build inlines its own copy of a shared *source* instead of
 * rollup emitting a cross-entry chunk that would break classic loading.
 *
 * Run after the main build with `emptyOutDir: false` so it adds content.js
 * to dist/ without wiping popup.js / background.js / index.html.
 */
export default defineConfig({
  base: './',
  resolve: {
    alias: { '@': resolve(__dirname, './src') },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    modulePreload: false,
    rollupOptions: {
      input: { content: resolve(__dirname, 'src/content/index.js') },
      // `iife` format already emits a single self-contained file (no code
      // splitting), which is required because the content script is loaded
      // as a classic, non-module script.
      output: {
        format: 'iife',
        entryFileNames: '[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
  },
});
