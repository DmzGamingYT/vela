import { describe, expect, it } from 'vitest'
import { isAuthPage, isThirdParty, isTracker, shouldBlock } from './blocklist'

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

describe('niveaux de blocage', () => {
  it('arrête les traqueurs connus dans les deux modes', () => {
    for (const level of ['trackers', 'strict'] as const) {
      expect(shouldBlock('https://stats.g.doubleclick.net/x', 'https://example.fr/', 'script', level)).toBe(true)
    }
  })

  it('le mode standard laisse passer les scripts d’un autre site', () => {
    expect(shouldBlock('https://cdn.autre.fr/app.js', 'https://example.fr/', 'script', 'trackers')).toBe(false)
  })

  it('le mode renforcé arrête les ressources actives d’un autre site', () => {
    expect(shouldBlock('https://cdn.autre.fr/app.js', 'https://example.fr/', 'script', 'strict')).toBe(true)
    expect(shouldBlock('https://ads.autre.fr/cadre', 'https://example.fr/', 'subFrame', 'strict')).toBe(true)
    expect(shouldBlock('https://mesure.autre.fr/collect', 'https://example.fr/', 'xhr', 'strict')).toBe(true)
  })

  it('garde les images, polices et styles d’un autre site', () => {
    expect(shouldBlock('https://cdn.autre.fr/photo.jpg', 'https://example.fr/', 'image', 'strict')).toBe(false)
    expect(shouldBlock('https://fonts.autre.fr/a.woff2', 'https://example.fr/', 'font', 'strict')).toBe(false)
    expect(shouldBlock('https://cdn.autre.fr/a.css', 'https://example.fr/', 'stylesheet', 'strict')).toBe(false)
  })

  it('ne touche pas à un sous-domaine du même site', () => {
    expect(shouldBlock('https://cdn.example.fr/app.js', 'https://www.example.fr/', 'script', 'strict')).toBe(false)
    expect(isThirdParty('https://example.fr/a.js', 'https://example.fr/page')).toBe(false)
  })
})
