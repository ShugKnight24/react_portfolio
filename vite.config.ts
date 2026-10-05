import react from '@vitejs/plugin-react';
import checker from 'vite-plugin-checker';
import { configDefaults, defineConfig } from 'vitest/config';

// https://vitejs.dev/config/
export default defineConfig({
  cacheDir: './.vite',
  optimizeDeps: {
    entries: ['index.html'],
  },
  // tsc already runs in `npm run build`; the checker only adds overlay errors in dev
  plugins: [checker({ typescript: true, enableBuild: false }), react()],
  resolve: {
    alias: {
      three: `${import.meta.dirname}/src/vendor/three/three.module.js`,
    },
  },
  server: {
    host: '127.0.0.1',
    // The preview launcher assigns a free port through PORT; 3000 is the local default
    port: Number(process.env.PORT) || 3000,
    strictPort: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './tests/setup.ts',
    // archive/ holds retired code that is no longer built or tested
    exclude: [...configDefaults.exclude, 'archive/**'],
  },
  build: {
    outDir: 'build',
  },
  css: {
    modules: {
      localsConvention: 'camelCase',
    },
  },
  base: './',
});
