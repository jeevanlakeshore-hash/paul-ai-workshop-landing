import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The site is served from https://www.vpslakeshorehospital.com/ai-workshop/, so all asset and API URLs carry this prefix.
const base = '/ai-workshop/';
const proxy = { [`${base}api`]: { target: 'http://127.0.0.1:3001', rewrite: path => path.slice(base.length - 1) } };

export default defineConfig({
  base,
  plugins: [react()],
  server: { proxy },
  preview: { proxy },
});
