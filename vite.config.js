import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: 'frontend',
  base: './',
  build: {
    outDir: '../dist-vite',
    emptyOutDir: true,
    cssMinify: false  // Disable CSS minification - has bugs with filter functions
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'frontend')
    }
  },
  server: {
    port: 5173
  }
})
