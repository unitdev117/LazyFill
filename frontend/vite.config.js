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
      input: {
        popup: resolve(__dirname, 'index.html'),
        background: resolve(__dirname, 'src/background/main.js'),
        content: resolve(__dirname, 'src/content/index.js'),
      },
      output: {
        entryFileNames: `[name].js`,
        chunkFileNames: `[name].js`,
        assetFileNames: `assets/[name].[ext]`,
      },
    },
  },
});
