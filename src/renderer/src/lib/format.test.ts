import { describe, expect, it, vi } from 'vitest'
import { initials, shortcut, spokenShortcut } from './format'

describe('pastille de repli', () => {
  it('garde deux lettres pour un nom de site', () => {
    expect(initials('Le Monde')).toBe('LM')
    expect(initials('Hacker News')).toBe('HN')
  })

  it('ne confond pas les titres numérotés', () => {
    // Le défaut d'origine : « Favori 1 », « Favori 10 » et « Favori 14 »
    // affichaient tous « F1 ».
    expect(initials('Favori 1')).toBe('F1')
    expect(initials('Favori 10')).toBe('F10')
    expect(initials('Favori 14')).toBe('F14')
    expect(new Set(['Favori 1', 'Favori 10', 'Favori 14'].map(initials)).size).toBe(3)
  })

  it('reste courte sur les cas courts', () => {
    expect(initials('GitHub')).toBe('G')
    expect(initials('   ')).toBe('·')
    expect(initials('')).toBe('·')
  })
})

describe('raccourcis selon la plateforme', () => {
  const on = (platform: string): void => {
    vi.stubGlobal('window', { vela: { platform } })
  }

  it('garde les glyphes sur macOS', () => {
    on('darwin')
    expect(shortcut('K')).toBe('⌘K')
    expect(shortcut('⇧T')).toBe('⌘⇧T')
    expect(shortcut('⇧[')).toBe('⌘⇧[')
    expect(shortcut('↵')).toBe('⌘↵')
    expect(spokenShortcut('⌘⇧T')).toBe('Commande Maj T')
  })

  it('écrit les mêmes raccourcis en toutes lettres ailleurs', () => {
    for (const platform of ['win32', 'linux']) {
      on(platform)
      expect(shortcut('K')).toBe('Ctrl+K')
      expect(shortcut('⇧T')).toBe('Ctrl+Shift+T')
      expect(shortcut('⇧[')).toBe('Ctrl+Shift+[')
      expect(shortcut(',')).toBe('Ctrl+,')
      expect(shortcut('↵')).toBe('Ctrl+↵')
      // Aucun glyphe de clavier Apple ne doit rester à l'écran.
      for (const key of ['K', 'L', 'T', 'W', '⇧T', '⇧D', '⇧O', '⇧H', '⇧A', '⇧B', '[', ']', ',', '↵', '0', '+', '-']) {
        expect(shortcut(key)).not.toMatch(/[⌘⇧⌥⌫]/)
      }
      expect(spokenShortcut('Ctrl+Shift+T')).toBe('Contrôle Maj T')
    }
  })
})
