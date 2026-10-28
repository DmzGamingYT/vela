/*
 * Préparation de la fenêtre avant tournage.
 *
 * Les pages web vivent dans des vues natives posées sur la fenêtre : ni le
 * screencast du protocole DevTools ni `capturePage()` ne les voient. On filme
 * donc la fenêtre avec `screencapture -l <identifiant>`, qui restitue la
 * composition complète — et uniquement cette fenêtre, jamais le bureau.
 *
 * Ce module est chargé par `NODE_OPTIONS=--require …` depuis une copie sans
 * espace de chemin. Il ne modifie pas le code de l'app.
 *
 * Variables d'environnement :
 *   VELA_WINDOW_JSON  fichier où écrire { id, content, scale } (obligatoire)
 *   VELA_WIDTH/HEIGHT taille logique du contenu (défaut 1440×900)
 *   VELA_AT           position écran du coin haut-gauche du contenu, « x,y »
 */
const fs = require('node:fs')

const out = process.env.VELA_WINDOW_JSON
if (out) {
  const width = Number(process.env.VELA_WIDTH || 1440)
  const height = Number(process.env.VELA_HEIGHT || 900)
  const [atX, atY] = (process.env.VELA_AT || '60,80').split(',').map(Number)

  /*
   * Un préchargement NODE_OPTIONS s'exécute avant que le module `electron` ne
   * soit enregistré : on réessaie au lieu d'abandonner au premier essai.
   */
  const waitForElectron = (attempt = 0) => {
    try {
      const electron = require('electron')
      if (electron && electron.app && electron.BrowserWindow) return electron
    } catch {
      /* pas encore disponible */
    }
    if (attempt > 400) throw new Error('module electron indisponible pour le tournage')
    return new Promise((resolve) => setTimeout(() => resolve(waitForElectron(attempt + 1)), 50))
  }

  Promise.resolve(waitForElectron()).then(({ app, BrowserWindow, screen }) => {
    app.whenReady().then(() => {
      const timer = setInterval(() => {
        const target = BrowserWindow.getAllWindows().find((win) => !win.isDestroyed() && win.isVisible())
        if (!target) return
        clearInterval(timer)

        try {
          // La fenêtre filmée doit tenir entièrement dans l'écran : sinon la
          // région capturée déborde et le bas de l'image est noir.
          const screenArea = screen.getPrimaryDisplay().workArea
          const size = {
            width: Math.min(width, screenArea.width - 24),
            height: Math.min(height, screenArea.height - 24)
          }
          target.setContentSize(size.width, size.height)
          // La fenêtre peut avoir un cadre : on recale pour que la zone de
          // contenu commence à la position demandée, bornée à l'écran.
          let bounds = target.getBounds()
          let content = target.getContentBounds()
          const at = {
            x: Math.max(screenArea.x, Math.min(atX, screenArea.x + screenArea.width - size.width)),
            y: Math.max(screenArea.y, Math.min(atY, screenArea.y + screenArea.height - size.height))
          }
          target.setBounds(
            {
              x: bounds.x + (at.x - content.x),
              y: bounds.y + (at.y - content.y),
              width: bounds.width,
              height: bounds.height
            },
            false
          )
          // Rien ne doit pouvoir recouvrir la fenêtre pendant le tournage.
          target.setAlwaysOnTop(true, 'screen-saver', 1)
          target.setVisibleOnAllWorkspaces?.(true, { visibleOnFullScreen: true })
          target.showInactive()
          content = target.getContentBounds()
          bounds = target.getBounds()

          fs.writeFileSync(
            out,
            JSON.stringify({
              id: target.getMediaSourceId?.() ?? null,
              content,
              bounds,
              scale: screen.getPrimaryDisplay().scaleFactor
            })
          )
        } catch (error) {
          fs.writeFileSync(out, JSON.stringify({ error: String(error && error.message) }))
        }
      }, 100)
    })
  })
}
