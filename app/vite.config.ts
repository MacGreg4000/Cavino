import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // manifest.json existe déjà dans public/ — on ne le régénère pas
      manifest: false,
      workbox: {
        // Cache tout le JS/CSS/HTML/fonts produit par le build
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        // Redirige toutes les navigations vers index.html (SPA)
        navigateFallback: 'index.html',
        // Exclure les API et WebSocket du cache SW
        navigateFallbackDenylist: [/^\/api\//, /^\/photos\//, /^\/ws/, /^\/public\//],
        // Pas de runtime caching des appels API (géré par Dexie)
        runtimeCaching: [],
        // Force update du SW dès que disponible
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
  server: {
    proxy: {
      '/api': 'http://localhost:3010',
      '/ws': { target: 'ws://localhost:3010', ws: true },
      '/photos': 'http://localhost:3010',
    },
  },
})
