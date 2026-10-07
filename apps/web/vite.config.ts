import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const previewPort = Number.parseInt(process.env.PORT ?? '', 10);

export default defineConfig(({ mode }) => {
  const apiBaseUrl = loadEnv(mode, process.cwd()).VITE_API_BASE_URL?.trim();
  const apiUrl = apiBaseUrl ? new URL(apiBaseUrl) : null;
  if (apiUrl && !['http:', 'https:'].includes(apiUrl.protocol)) {
    throw new Error('VITE_API_BASE_URL must be an http or https URL');
  }
  const apiSource = apiUrl ? ` ${apiUrl.origin}` : '';

  return {
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
      allowedHosts: [
        '.railway.app',
        '.up.railway.app',
        'wizardmakepotion.com',
        'www.wizardmakepotion.com',
      ],
      headers: {
        ...(mode === 'production' ? { 'Strict-Transport-Security': 'max-age=31536000' } : {}),
        'Content-Security-Policy': `default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'${apiSource}; img-src 'self' data: blob:${apiSource}; media-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`,
      },
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
  };
});
