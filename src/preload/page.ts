import { contextBridge, ipcRenderer, webFrame } from 'electron'

/**
 * Preload des pages web (l'interface a le sien : `index.ts`).
 *
 * Il ne touche à rien de sensible : aucun accès IPC, aucun objet exposé. Il
 * complète seulement l'objet `window.chrome`, qu'Electron livre vide alors que
 * Chrome y expose `app`, `csi` et `loadTimes`. Google refuse la connexion
 * (« Ce navigateur ou cette application ne sont peut-être pas sécurisés ») dès
 * qu'un User-Agent Chrome propre arrive sans cet objet : le contrôle
 * anti-navigateur-embarqué le vérifie en JavaScript, avant tout script de page.
 *
 * `webFrame.executeJavaScript` s'exécute dans le monde principal — contrairement
 * au preload lui-même — et ce dès le document naissant. L'isolation de contexte
 * reste donc active pour les pages.
 *
 * Il expose aussi le pont de traduction de BD, volontairement réduit à deux
 * appels : lire une image et traduire des répliques. Les deux exigent le jeton
 * remis au script injecté, lié à cet onglet et à une demi-heure. Sans jeton,
 * une page ne peut ni lire d'image avec vos cookies ni dépenser votre clé.
 */
const CHROME_OBJECT = `(() => {
  const w = window
  const chrome = w.chrome && typeof w.chrome === 'object' ? w.chrome : {}
  if (chrome.app && chrome.csi && chrome.loadTimes) return
  const timing = () => performance.timing || {}
  chrome.app = {
    isInstalled: false,
    InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
    RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
    getDetails() { return null },
    getIsInstalled() { return false },
    runningState() { return 'cannot_run' }
  }
  chrome.csi = () => {
    const t = timing()
    return { onloadT: t.domContentLoadedEventEnd, startE: t.navigationStart, pageT: performance.now(), tran: 15 }
  }
  chrome.loadTimes = () => {
    const t = timing()
    const seconds = (value) => (typeof value === 'number' ? value / 1000 : 0)
    return {
      requestTime: seconds(t.navigationStart),
      startLoadTime: seconds(t.navigationStart),
      commitLoadTime: seconds(t.responseStart),
      finishDocumentLoadTime: seconds(t.domContentLoadedEventEnd),
      finishLoadTime: seconds(t.loadEventEnd),
      firstPaintTime: seconds(t.responseStart),
      firstPaintAfterLoadTime: 0,
      navigationType: 'Other',
      wasFetchedViaSpdy: true,
      wasNpnNegotiated: true,
      npnNegotiatedProtocol: 'h2',
      wasAlternateProtocolAvailable: false,
      connectionInfo: 'h2'
    }
  }
  try {
    if (w.chrome !== chrome) {
      Object.defineProperty(w, 'chrome', {
        configurable: true,
        enumerable: true,
        writable: true,
        value: chrome
      })
    }
  } catch {
    /* objet verrouillé par la page */
  }
})()`

void webFrame.executeJavaScript(CHROME_OBJECT).catch(() => {
  /* page déjà remplacée : le prochain document repartira du preload */
})

contextBridge.exposeInMainWorld('__velaComicBridge', {
  image: (token: string, url: string) => ipcRenderer.invoke('comic:image', { token, url }),
  translate: (token: string, texts: string[]) => ipcRenderer.invoke('comic:translate', { token, texts })
})

/**
 * Poignée de capture : apparaît près d'un passage sélectionné et se glisse
 * jusque dans le panneau Notes. Le glisser natif est lancé par le processus
 * principal (`startDrag`), qui relit lui-même la sélection : la page ne peut
 * pas décider du texte envoyé. Un clic sur la poignée capture l'extrait.
 */
function installNoteGrip(): void {
  if (document.getElementById('__vela-note-grip')) return
  const host = document.createElement('div')
  host.id = '__vela-note-grip'
  host.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;'
  const shadow = host.attachShadow({ mode: 'closed' })
  shadow.innerHTML = `
    <style>
      .grip {
        position: fixed;
        display: none;
        align-items: center;
        gap: 6px;
        padding: 6px 11px 6px 9px;
        border-radius: 999px;
        border: 1px solid rgba(120, 115, 200, 0.35);
        background: rgba(255, 255, 255, 0.92);
        color: #2a2836;
        font: 500 12px/1.2 -apple-system, "Segoe UI", sans-serif;
        letter-spacing: 0.01em;
        box-shadow: 0 8px 22px rgba(28, 26, 48, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.85);
        backdrop-filter: blur(14px) saturate(1.2);
        cursor: grab;
        user-select: none;
      }
      .grip:active { cursor: grabbing; }
      .grip[dark="true"] {
        background: rgba(30, 29, 40, 0.92);
        color: #f3f1fb;
        border-color: rgba(168, 163, 255, 0.4);
      }
      .dot { width: 6px; height: 6px; border-radius: 999px; background: #5b5bd6; }
      svg { display: block; opacity: 0.75; }
    </style>
    <div class="grip" draggable="true" role="button" tabindex="0" aria-label="Glisser cet extrait dans les notes">
      <span class="dot"></span>
      Glisser dans les notes
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    </div>`
  document.documentElement.appendChild(host)
  const chip = shadow.querySelector('.grip') as HTMLDivElement | null
  if (!chip) return

  const dark = window.matchMedia('(prefers-color-scheme: dark)')
  const paint = (): void => {
    chip.setAttribute('dark', dark.matches ? 'true' : 'false')
  }
  paint()
  dark.addEventListener('change', paint)

  const hide = (): void => {
    chip.style.display = 'none'
  }

  let timer = 0
  const place = (): void => {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0 || !selection.toString().trim()) {
      hide()
      return
    }
    const range = selection.getRangeAt(0).cloneRange()
    const rects = range.getClientRects()
    const rect = rects.length > 0 ? rects[rects.length - 1] : range.getBoundingClientRect()
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      hide()
      return
    }
    chip.style.display = 'flex'
    const width = chip.offsetWidth || 190
    const box = range.getBoundingClientRect()
    const left = Math.min(window.innerWidth - width - 8, Math.max(8, rect.right - width))
    // Juste au-dessus du passage entier (pas de la dernière ligne), quand la place existe.
    const above = box.top - 34
    const top = above > 6 ? above : rect.bottom + 8
    chip.style.left = `${Math.round(left)}px`
    chip.style.top = `${Math.round(Math.max(8, top))}px`
  }
  const schedule = (): void => {
    window.clearTimeout(timer)
    timer = window.setTimeout(place, 40)
  }

  document.addEventListener('mouseup', schedule, true)
  document.addEventListener('keyup', (event) => {
    if (event.shiftKey || event.key.startsWith('Arrow') || event.key === 'a') schedule()
  }, true)
  document.addEventListener('selectionchange', schedule, true)
  window.addEventListener('scroll', hide, true)
  window.addEventListener('blur', hide)

  chip.addEventListener('dragstart', (event) => {
    event.preventDefault()
    hide()
    // Synchrone : Electron exige que startDrag soit lancé pendant le geste.
    const text = String(window.getSelection?.()?.toString() ?? '').slice(0, 8000)
    if (text.trim()) ipcRenderer.sendSync('notes:drag-selection', text)
  })
  chip.addEventListener('click', () => {
    hide()
    void ipcRenderer.invoke('notes:capture-selection').catch(() => undefined)
  })
  chip.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      chip.click()
    }
  })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', installNoteGrip, { once: true })
} else {
  installNoteGrip()
}
