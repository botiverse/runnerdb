import path from 'node:path'
import fs from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The site is built into ../dist next to api.json and schema.json, which
// `node ../build.mjs` writes first (the npm scripts run it before vite).
const API = path.resolve(import.meta.dirname, '../dist/api.json')
if (!fs.existsSync(API)) throw new Error('dist/api.json is missing; run `node build.mjs` first')

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      '@api': API,
    },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: false, // keep api.json and schema.json
    assetsDir: 'assets',
    chunkSizeWarningLimit: 700,
  },
})
