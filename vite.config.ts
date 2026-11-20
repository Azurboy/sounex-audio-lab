import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const { SOUNEX_DEMO_ORIGIN } = loadEnv(mode, '.', 'SOUNEX_')
  const proxy = {
    '^/v1/audio:(inspect|describe|ask|models)$': {
      target: SOUNEX_DEMO_ORIGIN || 'http://127.0.0.1:8798',
      changeOrigin: false,
      headers: { 'X-Sounex-Reasoning-Provider': 'deepseek' },
    },
  }
  return {
    base: './',
    plugins: [react()],
    build: {
      rollupOptions: { output: { entryFileNames: 'assets/lab.js', assetFileNames: asset =>
        asset.names.includes('index.css') ? 'assets/lab.css' : 'assets/[name]-[hash][extname]' } },
    },
    server: { host: '127.0.0.1', port: 43125, proxy },
    preview: { host: '127.0.0.1', proxy },
  }
})
