import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const hubPackageDir = path.dirname(fileURLToPath(import.meta.url));

/** Built files go to repo root `/hub` so static hosting serves `https://<site>/hub/` */
export default defineConfig({
  plugins: [react()],
  base: '/hub/',
  build: {
    outDir: path.resolve(hubPackageDir, '../hub'),
    emptyOutDir: true,
  },
});
