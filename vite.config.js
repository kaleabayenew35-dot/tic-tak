import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',

  build: {
    outDir: 'dist',
    target: 'es2022',
    rollupOptions: {
      input: 'index.html',
    },
    assetsInlineLimit: 4096,
    sourcemap: true,
  },

  server: {
    port: 3000,
    open: false,
  },

  preview: {
    port: 3000,
    host: '0.0.0.0',
    allowedHosts: [
      'tic-tak-5qd1.onrender.com',
    ],
  },
});
