import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { vercelApiDevPlugin } from './server/vite-api-plugin';

// https://vite.dev/config/
export default defineConfig({
  plugins: [vercelApiDevPlugin(), react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
