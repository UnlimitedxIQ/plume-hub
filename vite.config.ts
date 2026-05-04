import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunks split out so the main app bundle doesn't ship with
          // every dependency baked in. Each vendor chunk caches independently
          // across releases, which matters for the auto-update flow.
          'vendor-react': ['react', 'react-dom'],
          'vendor-motion': ['framer-motion'],
          'vendor-icons': ['lucide-react'],
          'vendor-markdown': ['react-markdown', 'remark-gfm'],
          'vendor-docx': ['mammoth/mammoth.browser'],
          'vendor-purify': ['dompurify'],
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
})
