import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

// CORE=real  -> use ../core/src/index.ts (the real Layer 1 + Layer 2 + container)
// otherwise  -> use the mock in src/core/mock.ts
const useReal = process.env.CORE === 'real';

export default defineConfig({
  // './' keeps asset + worker URLs relative, so the same build works on Vercel
  // and on a GitHub Pages project site (https://user.github.io/repo/).
  base: process.env.BASE_PATH ?? './',
  resolve: {
    alias: {
      'core-impl': useReal
        ? path.resolve(here, '../core/src/index.ts')
        : path.resolve(here, 'src/core/mock.ts'),
    },
  },
  define: {
    __CORE_MODE__: JSON.stringify(useReal ? 'real' : 'mock'),
  },
  worker: { format: 'es' },
  build: { target: 'es2022', sourcemap: true },
});
