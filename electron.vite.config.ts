import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import type { Plugin } from 'vite'

/**
 * Le serveur de développement ouvre un WebSocket sur localhost. En production,
 * la CSP ne doit autoriser aucune connexion en clair : le HTML porte un jeton,
 * remplacé ici par les adresses locales en `dev` et supprimé au build.
 */
function devWebSocket(): Plugin {
  return {
    name: 'vela-dev-websocket',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        return html.replace('__DEV_WS__', ctx.server ? 'ws://localhost:* ws://127.0.0.1:*' : '')
      }
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@shared': resolve('src/shared') }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@shared': resolve('src/shared') }
    },
    build: {
      rollupOptions: {
        input: {
          // Interface (expose `window.vela`) et pages web (identité seulement).
          index: resolve('src/preload/index.ts'),
          page: resolve('src/preload/page.ts')
        }
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react(), devWebSocket()]
  }
})
