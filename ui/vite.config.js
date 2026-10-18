import { defineConfig } from 'vite';
import { contentStore } from './content-store.js';

// Local-only: the page talks to Solonet through this dev/preview proxy (no CORS, nothing public),
// and partner photos/metadata go to the local content store (content-store.js), never anywhere public.
const proxy = { '/rpc': { target: 'http://localhost:8080', changeOrigin: true, rewrite: () => '/' } };
export default defineConfig({
  root: new URL('.', import.meta.url).pathname,
  plugins: [contentStore()],
  server: { host: 'localhost', proxy },
  preview: { host: 'localhost', proxy },
});
