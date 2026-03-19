import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const APP_BASE_PATH = '/wayback-radio/';
const isLocJsonRequest = ({ url, request }) => (
  request.method === 'GET'
  && url.origin === 'https://www.loc.gov'
  && (url.pathname.startsWith('/search/') || url.pathname.startsWith('/item/'))
  && url.searchParams.get('fo') === 'json'
);

const isAppShellAssetRequest = ({ url, request }) => (
  url.origin === self.location.origin
  && url.pathname.startsWith('/wayback-radio/')
  && (
    ['document', 'script', 'style', 'worker', 'font', 'image'].includes(request.destination)
    || url.pathname.startsWith('/wayback-radio/assets/')
    || /\.(?:css|js|mjs|png|svg|ico|woff2?)$/i.test(url.pathname)
  )
);

const isAudioMediaRequest = ({ url, request }) => (
  request.method === 'GET'
  && url.origin === self.location.origin
  && (
    request.destination === 'audio'
    || /\.(?:mp3|m4a|wav|ogg|aac|flac)(?:\?.*)?$/i.test(url.href)
  )
);

export default defineConfig({
  base: APP_BASE_PATH,
  build: {
    outDir: 'docs'
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.ico',
        'icon-192.png',
        'icon-512.png',
        'apple-touch-icon.png'
      ],
      manifest: {
        name: 'Wayback Radio',
        short_name: 'Wayback',
        description: 'Tune in on time. Archival recordings from Library of Congress.',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        orientation: 'portrait',
        start_url: APP_BASE_PATH,
        scope: APP_BASE_PATH,
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'apple-touch-icon.png',
            sizes: '180x180',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        navigateFallback: `${APP_BASE_PATH}index.html`,
        // Route patterns:
        // - Same-origin /wayback-radio/ HTML + bundled assets => app shell cache.
        // - https://www.loc.gov/search/?...&fo=json and /item/.../?fo=json => LOC metadata cache.
        // - Audio/media GET requests (including byte-range playback) => media cache.
        runtimeCaching: [
          {
            urlPattern: isAppShellAssetRequest,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'wayback-radio-app-shell-v1',
              cacheableResponse: {
                statuses: [0, 200]
              },
              expiration: {
                maxEntries: 64,
                maxAgeSeconds: 7 * 24 * 60 * 60
              }
            }
          },
          {
            urlPattern: isLocJsonRequest,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'wayback-radio-loc-json-v1',
              cacheableResponse: {
                statuses: [0, 200]
              },
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 24 * 60 * 60
              },
              networkTimeoutSeconds: 5
            }
          },
          {
            urlPattern: isAudioMediaRequest,
            handler: 'CacheFirst',
            options: {
              cacheName: 'wayback-radio-audio-media-v1',
              cacheableResponse: {
                statuses: [0, 200]
              },
              expiration: {
                maxEntries: 24,
                maxAgeSeconds: 30 * 24 * 60 * 60
              },
              rangeRequests: true
            }
          }
        ]
      }
    })
  ]
});
