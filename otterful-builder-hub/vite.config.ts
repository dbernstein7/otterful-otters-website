import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

/** Served at https://<site>/builder/ — see repo `vercel.json` + `3d-builder.html` iframe. */
export default defineConfig({
  plugins: [react()],
  base: '/builder/',
  resolve: {
    alias: { '@': path.resolve(rootDir, 'src') },
  },
  build: {
    outDir: path.resolve(rootDir, '../builder'),
    emptyOutDir: true,
  },
  publicDir: 'public',
});
