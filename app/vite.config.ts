import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/chenstricks-motion/',
  plugins: [react()],
  server: {
    port: 4175,
    fs: { allow: ['..'] },
  },
});
