/* Capture un fichier HTML local en PNG, à taille exacte. Usage :
   npx electron scripts/shot.cjs <html> <out.png> <largeur> <hauteur> */
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const [, , htmlPath, outPath, w, h] = process.argv
const W = Number(w) || 1024
const H = Number(h) || 1024

app.disableHardwareAcceleration()
app.commandLine.appendSwitch('force-color-profile', 'srgb')

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: W, height: H, show: false, frame: false, transparent: true,
    backgroundColor: '#00000000', useContentSize: true,
    webPreferences: { offscreen: true, contextIsolation: true, nodeIntegration: false }
  })
  await win.loadFile(path.resolve(htmlPath))
  await new Promise((r) => setTimeout(r, 900))
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: W, height: H })
  fs.writeFileSync(outPath, image.toPNG())
  console.log('capturé', outPath, image.getSize())
  app.exit(0)
}).catch((error) => {
  console.error('capture échouée :', error.message)
  app.exit(1)
})
