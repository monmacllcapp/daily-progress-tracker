import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // Some libraries look for global or process. This fixes "process is not defined" errors.
    global: 'globalThis',
    'process.env': {},
    process: { env: {} },
  },
})
