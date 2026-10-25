import { describe, expect, it } from 'vitest'
import { chromeUserAgent } from './userAgent'

describe('chromeUserAgent', () => {
  it('ne trahit jamais Electron (Google refuse sinon)', () => {
    for (const platform of ['darwin', 'win32', 'linux']) {
      const ua = chromeUserAgent('140.0.0.0', platform)
      expect(ua).not.toMatch(/electron/i)
      expect(ua).toContain('Chrome/140.0.0.0')
      expect(ua).toContain('AppleWebKit/537.36')
    }
  })

  it('adapte la plateforme', () => {
    expect(chromeUserAgent('140.0.0.0', 'win32')).toContain('Windows NT 10.0')
    expect(chromeUserAgent('140.0.0.0', 'linux')).toContain('X11; Linux x86_64')
    expect(chromeUserAgent('140.0.0.0', 'darwin')).toContain('Macintosh')
  })

  it('replie sur une version par défaut sûre', () => {
    expect(chromeUserAgent('', 'darwin')).toContain('Chrome/')
  })
})
