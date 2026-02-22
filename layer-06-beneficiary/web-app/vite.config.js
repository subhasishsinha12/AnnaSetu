import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api/erupi': { target: 'http://localhost:3005', changeOrigin: true, rewrite: (p) => p.replace(/^\/api\/erupi/, '') },
      '/api/kyc':   { target: 'http://localhost:8001', changeOrigin: true, rewrite: (p) => p.replace(/^\/api\/kyc/, '') }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false
  }
});
