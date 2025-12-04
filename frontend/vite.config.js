import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: [
      'diagrams.chandraloca.ru',
      '.chandraloca.ru' // Разрешаем все поддомены
    ],
    hmr: {
      host: 'diagrams.chandraloca.ru',
      protocol: 'wss',
      clientPort: 443
    },
    watch: {
      usePolling: true
    }
  }
})

