import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  // Tauri dev server must bind to the Tauri-expected port
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      // Tell vite to ignore the Rust src — only watch the frontend
      ignored: ['**/src-tauri/**'],
    },
  },

  // Env var set by Tauri CLI during dev
  envPrefix: ['VITE_', 'TAURI_'],

  build: {
    // Tauri requires a specific target for compatibility
    target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    // Minify in release; keep sourcemaps for debug
    minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
})
