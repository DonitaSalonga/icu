import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// VITE_* variables come from the repository-root .env (see .env.example).
export default defineConfig({
  plugins: [react()],
  envDir: '..',
  server: { port: 5173, strictPort: true },
});
