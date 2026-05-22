import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  // Important for Electron packaged app (file://): avoid absolute /assets paths.
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      // jsPDF "main" targets Node; force the browser ESM build for Vite.
      jspdf: path.resolve(__dirname, 'node_modules/jspdf/dist/jspdf.es.min.js'),
    },
  },
  optimizeDeps: {
    include: ['jspdf'],
  },
  server: {
    port: 5173,
    strictPort: true,
  },
})

