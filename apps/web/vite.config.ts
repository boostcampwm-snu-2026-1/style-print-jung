import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    fs: {
      allow: [path.resolve(__dirname, '../..')],
    },
    proxy: {
      '/api': 'http://localhost:4000',
      '/uploads': 'http://localhost:4000',
      '/generated-previews': 'http://localhost:4000',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
