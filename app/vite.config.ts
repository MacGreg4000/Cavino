import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:3010',
      '/ws': { target: 'ws://localhost:3010', ws: true },
      '/photos': 'http://localhost:3010',
    },
  },
})
