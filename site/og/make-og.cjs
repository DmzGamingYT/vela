/**
 * Vela — visuel de partage.
 *
 * Rend `site/og/og.html` en 1200×630 et l’écrit dans `site/public/og-vela.png`,
 * le fichier référencé par `og:image` et `twitter:image`.
 *
 *   ./node_modules/.bin/electron site/og/make-og.cjs
 *
 * À relancer quand la version, l’accroche ou la capture d’accueil changent.
 */

const { app, BrowserWindow } = require('electron')
const { writeFileSync } = require('node:fs')
const { join } = require('node:path')

// Le rendu doit sortir en 1200×630, quel que soit l’écran de la machine.
app.commandLine.appendSwitch('force-device-scale-factor', '1')

const root = join(__dirname, '../..')
const target = join(root, 'site/public/og-vela.png')

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1200,
    height: 630,
    show: false,
    frame: false,
    backgroundColor: '#faf8f5',
    webPreferences: { contextIsolation: true, sandbox: true }
  })

  await win.loadFile(join(root, 'site/og/og.html'))
  // Laisse le temps à la capture JPEG et aux polices système de se poser.
  await new Promise((resolve) => setTimeout(resolve, 1200))

  const image = await win.webContents.capturePage()
  const { width, height } = image.getSize()
  // Sur un écran Retina, la capture sort en 2× : on redescend à 1200×630.
  const final = width === 1200 && height === 630 ? image : image.resize({ width: 1200, height: 630, quality: 'best' })
  writeFileSync(target, final.toPNG())
  console.log(`og-vela.png ${final.getSize().width}×${final.getSize().height} → site/public/og-vela.png`)
  if (final.getSize().width !== 1200 || final.getSize().height !== 630) {
    console.error('attention : le visuel devrait faire 1200×630')
    app.exit(1)
  }
  app.quit()
})
