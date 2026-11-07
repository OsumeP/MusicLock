/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// En Docker el backend se llama "api"; fuera de Docker, localhost.
const apiTarget = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8000'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
    // En Docker sobre Windows/macOS los eventos de archivos del volumen montado no
    // llegan al contenedor: sin sondeo, Vite no detecta los cambios (sin recarga
    // automática). docker-compose.yml activa VITE_USE_POLLING=true.
    watch: process.env.VITE_USE_POLLING === 'true' ? { usePolling: true, interval: 300 } : undefined,
    // El frontend siempre llama a rutas relativas (/api/...). Vite las reenvía
    // al backend, así no hace falta CORS en desarrollo.
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // Varios tests usan criptografía real (PBKDF2 de 600 000 iteraciones, RSA-3072):
    // con los archivos en paralelo, 5 s por test no alcanza en máquinas lentas o en CI.
    testTimeout: 15_000,
  },
})
