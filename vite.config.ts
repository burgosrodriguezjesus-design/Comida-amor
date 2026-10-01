import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Modo «artifact»: versión de prueba que funciona solo en el navegador y se publica
// como una única página (ver scripts/build-artifact.mjs).
export default defineConfig(({ mode }) => {
  const artifact = mode === 'artifact';
  return {
    root: 'client',
    base: artifact ? './' : '/',
    publicDir: artifact ? false : 'public',
    plugins: [react(), tailwindcss()],
    define: {
      'import.meta.env.VITE_LOCAL': JSON.stringify(artifact ? '1' : ''),
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./client/src', import.meta.url)),
        '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
      },
    },
    build: {
      outDir: artifact ? '../dist/artifact' : '../dist/client',
      emptyOutDir: true,
      chunkSizeWarningLimit: artifact ? 4000 : 900,
      // En la página publicada todo va en un solo archivo (incluidas las tipografías).
      assetsInlineLimit: artifact ? 1_000_000 : 4096,
      cssCodeSplit: !artifact,
      rolldownOptions: artifact
        ? {
            // Dependencias opcionales de jsPDF que esta app no usa (exportar HTML/SVG).
            external: ['html2canvas', 'dompurify', 'canvg'],
            output: { codeSplitting: false },
          }
        : undefined,
    },
    server: {
      port: 5173,
      proxy: {
        // changeOrigin: false conserva el Host original para que la comprobación de Origin del servidor funcione en desarrollo.
        '/api': { target: 'http://localhost:3001', changeOrigin: false },
      },
    },
  };
});
