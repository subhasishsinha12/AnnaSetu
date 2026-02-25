import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: '127.0.0.1',
    proxy: {
      '/api/erupi': { target: 'http://127.0.0.1:3005', changeOrigin: true, rewrite: (p) => p.replace(/^\/api\/erupi/, '') },
      '/api/kyc':   { target: 'http://127.0.0.1:8001', changeOrigin: true, rewrite: (p) => p.replace(/^\/api\/kyc/, '') },
      '/api/donor': { target: 'http://127.0.0.1:3001', changeOrigin: true, rewrite: (p) => p.replace(/^\/api\/donor/, '') }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false
  }
});
