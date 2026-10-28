import { describe, expect, it } from 'vitest'
import { isAuthPage, isTracker } from './blocklist'

describe('isAuthPage', () => {
  it('reconnaît les pages de connexion', () => {
    expect(isAuthPage('https://accounts.google.com/ServiceLogin')).toBe(true)
    expect(isAuthPage('https://login.microsoftonline.com/common/oauth2/authorize')).toBe(true)
    expect(isAuthPage('https://appleid.apple.com/auth/authorize')).toBe(true)
  })

  it('ne confond pas les autres pages', () => {
    expect(isAuthPage('https://mail.google.com/')).toBe(false)
    expect(isAuthPage('https://www.google.com/')).toBe(false)
    expect(isAuthPage('not a url')).toBe(false)
  })
})

describe('isTracker', () => {
  it('bloque toujours les pisteurs connus', () => {
    expect(isTracker('https://www.google-analytics.com/g/collect')).toBe(true)
    expect(isTracker('https://stats.doubleclick.net/x')).toBe(true)
  })

  it('ne bloque jamais les hôtes de connexion', () => {
    expect(isTracker('https://accounts.google.com/ServiceLogin')).toBe(false)
    expect(isTracker('https://ssl.gstatic.com/accounts/x')).toBe(false)
  })
})

/**
 * Le filtre lit l'hôte sans construire d'objet `URL` : ces cas figent la
 * lecture rapide, y compris les adresses qui doivent repasser par `URL`.
 */
describe('lecture de l’hôte', () => {
  it('reconnaît un traqueur et ses sous-domaines', () => {
    expect(isTracker('https://doubleclick.net/pixel')).toBe(true)
    expect(isTracker('https://stats.g.doubleclick.net/collect?v=1')).toBe(true)
    expect(isTracker('http://www.google-analytics.com/collect')).toBe(true)
  })

  it('laisse passer les sites ordinaires', () => {
    expect(isTracker('https://example.org/article')).toBe(false)
    expect(isTracker('https://notdoubleclick.net/')).toBe(false)
    expect(isTracker('https://github.com/vela')).toBe(false)
  })

  it('ignore le port, les identifiants et la requête', () => {
    expect(isTracker('https://stats.g.doubleclick.net:8443/x')).toBe(true)
    expect(isTracker('https://user:secret@doubleclick.net/x')).toBe(true)
    expect(isTracker('https://example.org/?u=doubleclick.net')).toBe(false)
    expect(isTracker('https://example.org/#doubleclick.net')).toBe(false)
  })

  it('retombe sur `URL` pour les adresses inhabituelles', () => {
    expect(isTracker('https://[::1]/')).toBe(false)
    expect(isTracker('pas une url')).toBe(false)
    expect(isTracker('')).toBe(false)
    expect(isAuthPage('https://accounts.google.com/signin')).toBe(true)
    expect(isAuthPage('https://[2001:db8::1]/')).toBe(false)
  })
})
