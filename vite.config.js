import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import ports from './ports.json'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: 'frontend',
  base: './',
  define: {
    __PORTS__: JSON.stringify(ports)
  },
  build: {
    outDir: '../dist-vite',
    emptyOutDir: true,
    cssMinify: false  // Disable CSS minification - has bugs with filter functions
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'frontend'),
      '@entities': path.resolve(__dirname, 'entities')
    }
  },
  server: {
    port: ports.vite,
    host: true  // Allow network access (for phone)
  }
})
