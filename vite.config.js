import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // The old single-file app lives in legacy/ for reference only; it is not part of the build.
    outDir: 'dist',
  },
  test: {
    environment: 'node',
  },
});
