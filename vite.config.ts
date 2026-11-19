import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const service = 'http://127.0.0.1:5080'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    proxy: { '/health': service, '/api': service },
  },
  test: { environment: 'jsdom' },
})
