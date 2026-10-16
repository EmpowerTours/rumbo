import { defineConfig } from 'vite';

// Local-only: the page talks to Solonet through this dev/preview proxy (no CORS, nothing public).
const proxy = { '/rpc': { target: 'http://localhost:8080', changeOrigin: true, rewrite: () => '/' } };
export default defineConfig({
  root: new URL('.', import.meta.url).pathname,
  server: { host: 'localhost', proxy },
  preview: { host: 'localhost', proxy },
});
