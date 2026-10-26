import { webFrame } from 'electron'

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
