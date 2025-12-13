import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Определяем режим работы из переменной окружения
// Поддерживаем строковые значения 'True', 'true', 'False', 'false' и булевы значения
const debugValue = process.env.VITE_DEBUG
const isDebug = debugValue === 'True' || debugValue === 'true' || debugValue === true || debugValue === '1'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: isDebug 
      ? ['localhost', '127.0.0.1'] // В DEBUG режиме разрешаем только localhost
      : [
          'diagrams.chandraloca.ru',
          '.chandraloca.ru' // В PROD режиме разрешаем домен
        ],
    hmr: isDebug 
      ? {
          // В DEBUG режиме HMR работает напрямую
          host: 'localhost',
          protocol: 'ws',
          port: 5173
        }
      : {
          // В PROD режиме HMR работает через nginx прокси
          host: 'diagrams.chandraloca.ru',
          protocol: 'wss',
          clientPort: 443,
          overlay: false, // Отключаем overlay при ошибках
          reconnect: 5
        },
    watch: {
      usePolling: true,
      interval: isDebug ? 500 : 1000 // В DEBUG режиме более частый опрос
    }
  }
})

