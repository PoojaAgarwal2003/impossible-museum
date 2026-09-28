import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5175, strictPort: true, watch: { ignored: ['**/artifacts/**'] } },
  preview: { port: 4175, strictPort: true },
  build: {
    rollupOptions: { output: { manualChunks: { three: ['three'] } } },
  },
});
