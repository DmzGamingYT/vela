/**
 * Azimut — visuel de partage.
 *
 * Rend `site/og/og.html` en 1200×630 et l’écrit dans `site/public/og-azimut.png`,
 * le fichier référencé par `og:image` et `twitter:image` (converti en JPEG
 * par la recette du README).
 *
 *   ./node_modules/.bin/electron site/og/make-og.cjs
 *
 * À relancer quand la version, l’accroche ou la capture d’accueil changent.
 */

const { app, BrowserWindow } = require('electron')
const { readFileSync, writeFileSync, rmSync } = require('node:fs')
const { join } = require('node:path')

const { version } = require('../../package.json')

// Le rendu doit sortir en 1200×630, quel que soit l’écran de la machine.
app.commandLine.appendSwitch('force-device-scale-factor', '1')

const root = join(__dirname, '../..')
const target = join(root, 'site/public/og-azimut.png')

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1200,
    height: 630,
    show: false,
    frame: false,
    backgroundColor: '#faf8f5',
    webPreferences: { contextIsolation: true, sandbox: true }
  })

  /* Le gabarit est rempli avant rendu : la version vient de package.json et la
     vignette de la capture d’accueil réellement publiée (WebP, pas de JPEG
     intermédiaire qui n’existe plus). */
  const template = join(root, 'site/og/og.html')
  const filled = join(root, 'site/og/.og-filled.html')
  writeFileSync(
    filled,
    readFileSync(template, 'utf8')
      // La version affichée est celle que le site annonce, pas celle de package.json :
      // les deux peuvent différer d'une version, et la carte ne doit pas la devancer.
      .replace(
        /\{\{version\}\}/g,
        readFileSync(join(root, 'site/public/index.html'), 'utf8').match(
          /<span class="brand-version">([^<]+)</
        )?.[1] ?? version
      )
      .replace(/\{\{shot\}\}/g, '../public/captures/bibliotheque-1080.webp')
  )
  await win.loadFile(filled)
  // Laisse le temps à la capture JPEG et aux polices système de se poser.
  await new Promise((resolve) => setTimeout(resolve, 1200))

  const image = await win.webContents.capturePage()
  const { width, height } = image.getSize()
  // Sur un écran Retina, la capture sort en 2× : on redescend à 1200×630.
  const final =
    width === 1200 && height === 630
      ? image
      : image.resize({ width: 1200, height: 630, quality: 'best' })
  writeFileSync(target, final.toPNG())
  rmSync(filled, { force: true })
  console.log(
    `og-azimut.png ${final.getSize().width}×${final.getSize().height} → site/public/og-azimut.png`
  )
  if (final.getSize().width !== 1200 || final.getSize().height !== 630) {
    console.error('attention : le visuel devrait faire 1200×630')
    app.exit(1)
  }
  app.quit()
})
