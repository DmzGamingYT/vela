const { app, session } = require('electron')
const https = require('node:https')
const fs = require('node:fs')
const CHROME_UA = require('node:module').createRequire(__filename)('@shared/userAgent')
const TMP = '/private/var/folders/k4/jt7vpptx2qdb9wsg275sj8pw0000gn/T/opencode'
const CLIENT_HINTS = {
  'sec-ch-ua': '"Chromium";v="156", "Google Chrome";v="156", "Not_A_Brand";v="8"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"macOS"'
}
app.whenReady().then(async () => {
  const server = https.createServer(
    { key: fs.readFileSync(`${TMP}/key.pem`), cert: fs.readFileSync(`${TMP}/cert.pem`) },
    (req, res) => { res.setHeader('content-type','application/json'); res.end(JSON.stringify(req.headers)) }
  )
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port
  const ses = session.fromPartition('persist:https-test')
  ses.setCertificateVerifyProc((request, callback) => callback(0))
  // Cas « avant » : listener d'identité seul (l space session avant le correctif)
  const sesA = session.fromPartition('persist:https-a')
  sesA.setCertificateVerifyProc((r, cb) => cb(0))
  sesA.webRequest.onBeforeSendHeaders({ urls: ['http://*/*','https://*/*'] }, (d, cb) => {
    d.requestHeaders['User-Agent'] = CHROME_UA.chromeUserAgent(process.versions.chrome, process.platform)
    for (const name of Object.keys(CLIENT_HINTS)) d.requestHeaders[name] = CLIENT_HINTS[name]
    cb({ requestHeaders: d.requestHeaders })
  })
  const a = await (await sesA.fetch(`https://127.0.0.1:${port}/`)).json()
  console.log('--- avec le listener d\'identité (seul) ---')
  console.log('user-agent :', a['user-agent'])
  console.log('sec-ch-ua  :', a['sec-ch-ua'])
  // Cas « avant correctif » : le second listener écrase le premier
  const sesB = session.fromPartition('persist:https-b')
  sesB.setCertificateVerifyProc((r, cb) => cb(0))
  sesB.webRequest.onBeforeSendHeaders({ urls: ['http://*/*','https://*/*'] }, (d, cb) => {
    d.requestHeaders['User-Agent'] = CHROME_UA.chromeUserAgent(process.versions.chrome, process.platform)
    for (const name of Object.keys(CLIENT_HINTS)) d.requestHeaders[name] = CLIENT_HINTS[name]
    cb({ requestHeaders: d.requestHeaders })
  })
  sesB.webRequest.onBeforeSendHeaders((d, cb) => {
    d.requestHeaders['Accept-Language'] = 'de-DE,de;q=0.9'
    cb({ requestHeaders: d.requestHeaders })
  })
  const b = await (await sesB.fetch(`https://127.0.0.1:${port}/`)).json()
  console.log('--- avant correctif (2e listener) ---')
  console.log('user-agent :', b['user-agent'])
  console.log('sec-ch-ua  :', b['sec-ch-ua'])
  server.close(); app.quit()
})
