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
    plugins: [react(), devWebSocket()],
    build: {
      // electron-vite désactive la minification par défaut (main, preload et
      // renderer). Ici la coque paie ce confort à chaque lancement : les 78
      // tranches de styles et le bundle React pesaient 2,5 Mo à lire et
      // parser. Minifié, `out/renderer` tombe à 1,4 Mo (JS 1,0 Mo → 487 ko,
      // CSS 733 ko → 501 ko), sans changer une seule ligne de source.
      minify: true,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
              return 'vendor-react'
            }
            if (id.includes('node_modules/zustand')) {
              return 'vendor-zustand'
            }
          }
        }
      }
    }
  }
})
