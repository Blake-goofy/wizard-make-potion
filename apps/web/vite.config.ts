import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const previewPort = Number.parseInt(process.env.PORT ?? '', 10);

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    allowedHosts: ['.loca.lt'],
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
  preview: {
    host: '0.0.0.0',
    port: Number.isFinite(previewPort) ? previewPort : 4173,
    allowedHosts: ['.railway.app', '.up.railway.app', 'wizardmakepotion.com', 'www.wizardmakepotion.com'],
  },
  build: {
    target: 'es2022',
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'react';
          }

          return undefined;
        },
      },
    },
  },
});
