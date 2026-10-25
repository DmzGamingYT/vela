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
