import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Build apenas do app de pedidos online (para deploy).
// O PDV completo (caixa, cozinha, etc.) roda localmente com npm run dev / npm run build.
export default defineConfig({
  define: { 'import.meta.env.VITE_PUBLIC_ONLY': 'true' },
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist-pedir',
    emptyOutDir: true,
    rollupOptions: {
      input: { index: 'pedir.html' },
    },
  },
  server: {
    port: 5174,
    open: '/pedir.html',
    host: '0.0.0.0',
    strictPort: true,
    allowedHosts: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:3001', changeOrigin: true },
      '/socket.io': { target: 'http://127.0.0.1:3001', ws: true, changeOrigin: true },
    },
  },
})
