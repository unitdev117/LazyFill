import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'surgical-remove-crossorigin',
      transformIndexHtml(html) {
        // Remove crossorigin ONLY from local script and link tags
        return html
          .replace(/<script type="module" crossorigin src="\.\/popup\.js"><\/script>/g, '<script type="module" src="./popup.js"></script>')
          .replace(/<link rel="stylesheet" crossorigin href="\.\/assets\/popup\.css">/g, '<link rel="stylesheet" href="./assets/popup.css">');
      }
    }
  ],
  base: './',
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    modulePreload: false,
    rollupOptions: {
      // NOTE: the content script is built separately (vite.content.config.js)
      // as a self-contained IIFE so it can share modules with the background
      // bundle without rollup emitting a cross-entry chunk.
      input: {
        popup: resolve(__dirname, 'index.html'),
        background: resolve(__dirname, 'src/background/main.js'),
      },
      output: {
        entryFileNames: `[name].js`,
        chunkFileNames: `[name].js`,
        assetFileNames: `assets/[name].[ext]`,
      },
    },
  },
});
