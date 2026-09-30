import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const getGitSha = () => {
  const configuredSha = process.env.VITE_GIT_SHA?.trim()
  if (configuredSha && configuredSha !== 'dev') return configuredSha

  try {
    const fromGit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: __dirname,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString().trim()
    if (fromGit) return fromGit
  } catch {
    // no .git in Docker build context — GIT_SHA build-arg is required for prod
  }

  if (configuredSha) return configuredSha
  return 'dev'
}

const gitSha = getGitSha()

if (process.env.NODE_ENV === 'production' && (!gitSha || gitSha === 'dev')) {
  console.warn(
    '[vite] VITE_GIT_SHA is missing/dev in production build. Pass GIT_SHA build-arg (Docker has no .git).'
  )
}

// РћРїСЂРµРґРµР»СЏРµРј СЂРµР¶РёРј СЂР°Р±РѕС‚С‹ РёР· РїРµСЂРµРјРµРЅРЅРѕР№ РѕРєСЂСѓР¶РµРЅРёСЏ
// РџРѕРґРґРµСЂР¶РёРІР°РµРј СЃС‚СЂРѕРєРѕРІС‹Рµ Р·РЅР°С‡РµРЅРёСЏ 'True', 'true', 'False', 'false' Рё Р±СѓР»РµРІС‹ Р·РЅР°С‡РµРЅРёСЏ
const debugValue = process.env.VITE_DEBUG
const isDebug = debugValue === 'True' || debugValue === 'true' || debugValue === true || debugValue === '1'

export default defineConfig({
  plugins: [react()],
  // plotly.js pulls Node's buffer. Alias must point at the real package file so
  // Rollup bundles it. Value "buffer/" leaves bare import "buffer/" in prod вЂ”
  // browsers throw TypeError and #root stays empty.
  resolve: {
    alias: [
      // plotly.js does require('buffer/') вЂ” trailing slash is intentional in upstream.
      // Map both specifiers to the installed package so Rollup inlines it (no bare import).
      { find: 'buffer/', replacement: path.resolve(__dirname, 'node_modules/buffer/') },
      { find: 'buffer', replacement: path.resolve(__dirname, 'node_modules/buffer/') },
    ],
  },
  define: {
    global: 'globalThis',
    'import.meta.env.VITE_GIT_SHA': JSON.stringify(gitSha),
  },
  optimizeDeps: {
    include: ['buffer', 'plotly.js', 'react-plotly.js', 'd3'],
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: isDebug
      ? ['localhost', '127.0.0.1'] // Р’ DEBUG СЂРµР¶РёРјРµ СЂР°Р·СЂРµС€Р°РµРј С‚РѕР»СЊРєРѕ localhost
      : [
          'diagrams.chandraloca.ru',
          '.chandraloca.ru' // Р’ PROD СЂРµР¶РёРјРµ СЂР°Р·СЂРµС€Р°РµРј РґРѕРјРµРЅ
        ],
    // РќР°СЃС‚СЂРѕР№РєР° HMR РІ Р·Р°РІРёСЃРёРјРѕСЃС‚Рё РѕС‚ СЂРµР¶РёРјР°
    hmr: false, // disabled HMR to avoid auto reloads
    // Р’ production С‡РµСЂРµР· nginx HMR РЅРµ РЅСѓР¶РµРЅ, С‚Р°Рє РєР°Рє РёСЃРїРѕР»СЊР·СѓРµС‚СЃСЏ build РІРµСЂСЃРёСЏ
    watch: {
      // РћС‚РєР»СЋС‡Р°РµРј polling - РёСЃРїРѕР»СЊР·СѓРµРј РЅР°С‚РёРІРЅС‹Рµ СЃРѕР±С‹С‚РёСЏ С„Р°Р№Р»РѕРІРѕР№ СЃРёСЃС‚РµРјС‹
      usePolling: false,
      // РћС‚РєР»СЋС‡Р°РµРј Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєСѓСЋ РїРµСЂРµР·Р°РіСЂСѓР·РєСѓ РїСЂРё РёР·РјРµРЅРµРЅРёРё С„Р°Р№Р»РѕРІ
      ignored: ['**/node_modules/**', '**/.git/**']
    }
  },
  // РќР°СЃС‚СЂРѕР№РєРё РґР»СЏ production build
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false, // РћС‚РєР»СЋС‡Р°РµРј sourcemap РІ production РґР»СЏ Р±РµР·РѕРїР°СЃРЅРѕСЃС‚Рё
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // РЈРґР°Р»СЏРµРј console.log РІ production
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
  // РќР°СЃС‚СЂРѕР№РєРё preview СЃРµСЂРІРµСЂР° (РґР»СЏ production)
  preview: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true
  }
})
