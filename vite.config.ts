import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  root: 'client',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./client/src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  build: {
    outDir: '../dist/client',
    emptyOutDir: true,
    chunkSizeWarningLimit: 900,
  },
  server: {
    port: 5173,
    proxy: {
      // changeOrigin: false conserva el Host original para que la comprobación de Origin del servidor funcione en desarrollo.
      '/api': { target: 'http://localhost:3001', changeOrigin: false },
    },
  },
});
