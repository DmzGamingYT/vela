/**
 * User-Agent Chrome « propre » : sans le jeton `Electron/…`.
 * Google (et d'autres fournisseurs) refusent la connexion OAuth/htlm
 * dès que l'UA trahit un navigateur embarqué (« navigateur non sécurisé »).
 */
export function chromeUserAgent(chromeVersion: string, platform: string): string {
  const chrome = chromeVersion.trim() || '140.0.0.0'
  if (platform === 'win32') {
    return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chrome} Safari/537.36`
  }
  if (platform === 'linux') {
    return `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chrome} Safari/537.36`
  }
  return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chrome} Safari/537.36`
}
