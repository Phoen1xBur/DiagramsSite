import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Определяем режим работы из переменной окружения
// Поддерживаем строковые значения 'True', 'true', 'False', 'false' и булевы значения
const debugValue = process.env.VITE_DEBUG
const isDebug = debugValue === 'True' || debugValue === 'true' || debugValue === true || debugValue === '1'

export default defineConfig({
  plugins: [react()],
  // plotly.js pulls Node's buffer. Alias must point at the real package file so
  // Rollup bundles it. Value "buffer/" leaves bare import "buffer/" in prod —
  // browsers throw TypeError and #root stays empty.
  resolve: {
    alias: [
      // plotly.js does require('buffer/') — trailing slash is intentional in upstream.
      // Map both specifiers to the installed package so Rollup inlines it (no bare import).
      { find: 'buffer/', replacement: path.resolve(__dirname, 'node_modules/buffer/') },
      { find: 'buffer', replacement: path.resolve(__dirname, 'node_modules/buffer/') },
    ],
  },
  define: {
    global: 'globalThis',
  },
  optimizeDeps: {
    include: ['buffer', 'plotly.js', 'react-plotly.js', 'd3'],
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: isDebug
      ? ['localhost', '127.0.0.1'] // В DEBUG режиме разрешаем только localhost
      : [
          'diagrams.chandraloca.ru',
          '.chandraloca.ru' // В PROD режиме разрешаем домен
        ],
    // Настройка HMR в зависимости от режима
    hmr: false, // disabled HMR to avoid auto reloads
    // В production через nginx HMR не нужен, так как используется build версия
    watch: {
      // Отключаем polling - используем нативные события файловой системы
      usePolling: false,
      // Отключаем автоматическую перезагрузку при изменении файлов
      ignored: ['**/node_modules/**', '**/.git/**']
    }
  },
  // Настройки для production build
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false, // Отключаем sourcemap в production для безопасности
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Удаляем console.log в production
        drop_debugger: true
      }
    },
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'plotly-vendor': ['plotly.js', 'react-plotly.js']
        }
      }
    }
  },
  // Настройки preview сервера (для production)
  preview: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true
  }
})
