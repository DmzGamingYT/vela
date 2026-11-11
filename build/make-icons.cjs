/* Génère le kit d'icônes de Vela depuis `build/icon-safari.svg`.

   Équivalent Node de `build/make-icons.py` : ce dernier dépend de Pillow, qui
   n'est pas installé partout, alors que Chromium est déjà là. Chaque taille
   est rendue nativement depuis le SVG (donc nette à 16 px, contrairement à un
   rééchantillonnage du 1024) et écrite en PNG avec transparence.

   Sorties : build/icon.icns, build/icon.ico, build/Vela.iconset/*.png,
   build/icon-1024.png, build/icon-512.png, build/iconTemplate.png et @2x.

   Usage :
     env -u ELECTRON_RUN_AS_NODE node_modules/electron/dist/Electron.app/Contents/MacOS/Electron build/make-icons.cjs
*/
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const BUILD = __dirname
const MASTER = path.join(BUILD, 'icon-safari.svg')
const SMALL = path.join(BUILD, 'icon-safari-small.svg')
const TEMPLATE = path.join(BUILD, 'icon-template-safari.svg')
// En dessous de 64 px, le maître détaillé se délite (anneau d'un quart de
// pixel, graduation en salissure) : ces tailles viennent du maître simplifié.
const SMALL_UP_TO = 48
const ICONSET = path.join(BUILD, 'Vela.iconset')

app.disableHardwareAcceleration()
app.commandLine.appendSwitch('force-color-profile', 'srgb')

/** Rend un SVG en PNG carré, à la taille exacte, fond transparent. */
async function render(win, svgPath, size) {
  const svg = fs.readFileSync(svgPath, 'utf8')
  const url = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64')
  const dataUrl = await win.webContents.executeJavaScript(`(async () => {
    const image = new Image()
    image.src = ${JSON.stringify(url)}
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = ${size}
    canvas.height = ${size}
    const context = canvas.getContext('2d')
    context.clearRect(0, 0, ${size}, ${size})
    context.drawImage(image, 0, 0, ${size}, ${size})
    return canvas.toDataURL('image/png')
  })()`)
  return Buffer.from(String(dataUrl).split(',')[1], 'base64')
}

/** .ico multi-résolutions, entrées PNG (Vista et suivants). */
function buildIco(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  const entries = []
  const payloads = []
  let offset = 6 + 16 * images.length
  for (const { size, png } of images) {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(size >= 256 ? 0 : size, 0)
    entry.writeUInt8(size >= 256 ? 0 : size, 1)
    entry.writeUInt8(0, 2)
    entry.writeUInt8(0, 3)
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(png.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += png.length
    entries.push(entry)
    payloads.push(png)
  }
  return Buffer.concat([header, ...entries, ...payloads])
}

app
  .whenReady()
  .then(async () => {
    const win = new BrowserWindow({
      width: 1024,
      height: 1024,
      show: false,
      transparent: true,
      backgroundColor: '#00000000',
      webPreferences: { offscreen: true, contextIsolation: true, nodeIntegration: false }
    })
    await win.loadURL('about:blank')

    const sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024]
    const png = new Map()
    for (const size of sizes) {
      png.set(size, await render(win, size <= SMALL_UP_TO ? SMALL : MASTER, size))
    }
    const template16 = await render(win, TEMPLATE, 16)
    const template32 = await render(win, TEMPLATE, 32)
    win.destroy()

    fs.mkdirSync(ICONSET, { recursive: true })
    for (const stale of fs.readdirSync(ICONSET)) fs.unlinkSync(path.join(ICONSET, stale))
    const iconset = {
      'icon_16x16.png': 16,
      'icon_16x16@2x.png': 32,
      'icon_32x32.png': 32,
      'icon_32x32@2x.png': 64,
      'icon_128x128.png': 128,
      'icon_128x128@2x.png': 256,
      'icon_256x256.png': 256,
      'icon_256x256@2x.png': 512,
      'icon_512x512.png': 512,
      'icon_512x512@2x.png': 1024
    }
    for (const [name, size] of Object.entries(iconset)) {
      fs.writeFileSync(path.join(ICONSET, name), png.get(size))
    }
    execFileSync('iconutil', ['-c', 'icns', ICONSET, '-o', path.join(BUILD, 'icon.icns')])

    fs.writeFileSync(
      path.join(BUILD, 'icon.ico'),
      buildIco([16, 24, 32, 48, 64, 128, 256].map((size) => ({ size, png: png.get(size) })))
    )

    fs.writeFileSync(path.join(BUILD, 'icon-1024.png'), png.get(1024))
    fs.writeFileSync(path.join(BUILD, 'icon-512.png'), png.get(512))
    fs.writeFileSync(path.join(BUILD, 'iconTemplate.png'), template16)
    fs.writeFileSync(path.join(BUILD, 'iconTemplate@2x.png'), template32)

    console.log('OK : icon.icns · icon.ico · Vela.iconset (10 fichiers) · icon-1024.png · icon-512.png · iconTemplate.png/@2x')
    app.exit(0)
  })
  .catch((error) => {
    console.error('export échoué :', error)
    app.exit(1)
  })
