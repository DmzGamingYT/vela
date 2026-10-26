const { app, BrowserWindow } = require('electron')
const { writeFileSync } = require('node:fs')
const { join } = require('node:path')

const root = join(__dirname, '../..')

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1200,
    height: 630,
    show: false,
    frame: false,
    backgroundColor: '#151518',
    webPreferences: { offscreen: true, deviceScaleFactor: 1 }
  })

  await win.loadFile(join(root, 'site/og/og.html'))
  await new Promise((resolve) => setTimeout(resolve, 900))

  const image = await win.webContents.capturePage()
  writeFileSync(join(root, 'site/public/og-vela.png'), image.toPNG())
  console.log('og-vela.png', image.getSize())
  app.quit()
})
