import { describe, expect, it, vi } from 'vitest'
import type { MenuItemConstructorOptions } from 'electron'

vi.mock('electron', () => ({
  app: { name: 'Vela' },
  Menu: { buildFromTemplate: vi.fn(), setApplicationMenu: vi.fn() },
  shell: { openExternal: vi.fn() }
}))

const { buildMenuTemplate } = await import('./menu')

type Entry = {
  label: string
  accelerator?: string
  registerAccelerator?: boolean
  click?: () => void
}

/** Tous les éléments du gabarit, aplatis, avec leur menu d'origine. */
function flatten(template: MenuItemConstructorOptions[]): { menu: string; entry: Entry }[] {
  const rows: { menu: string; entry: Entry }[] = []
  const walk = (menu: string, items: MenuItemConstructorOptions[]): void => {
    for (const raw of items) {
      const entry = raw as unknown as Entry
      rows.push({ menu, entry })
      if (raw.submenu) walk(entry.label, raw.submenu as MenuItemConstructorOptions[])
    }
  }
  walk('', template)
  return rows
}

const PLATFORMS = ['darwin', 'win32', 'linux'] as const

function build(platform: string, sent: string[] = []): ReturnType<typeof flatten> {
  return flatten(buildMenuTemplate(platform, (action) => sent.push(action)))
}

describe('menu — accélérateurs sur les trois plateformes', () => {
  for (const platform of PLATFORMS) {
    it(`déclare des accélérateurs CmdOrCtrl, jamais enregistrés — ${platform}`, () => {
      const accelered = build(platform).filter(({ entry }) => entry.accelerator)
      expect(accelered.length).toBeGreaterThan(20)
      for (const { menu, entry } of accelered) {
        expect(entry.accelerator, `${entry.label} (${menu})`).toMatch(/^CmdOrCtrl\+/)
        expect(entry.registerAccelerator, `${entry.label} (${menu})`).toBe(false)
        // « Cmd+ » seul ne s'affiche pas sous Windows ni Linux.
        expect(entry.accelerator).not.toMatch(/^Cmd\+/)
      }
    })
  }

  it('affiche le même jeu de raccourcis partout', () => {
    // Le menu porteur diffère (Réglages vit sous « Vela » sur macOS, sous
    // « Fichier » ailleurs) : on compare le couple action/raccourci.
    const couples = (platform: string): string[] =>
      build(platform)
        .filter(({ entry }) => entry.accelerator)
        .map(({ entry }) => `${entry.label}/${entry.accelerator}`)
        .sort()
    const mac = couples('darwin')
    expect(couples('win32')).toEqual(mac)
    expect(couples('linux')).toEqual(mac)
  })

  it('ouvre sur Ctrl+Maj+T et ferme sur Ctrl+W sous Windows comme sous Linux', () => {
    for (const platform of ['win32', 'linux']) {
      const rows = build(platform)
      const reopen = rows.find(({ entry }) => entry.label === 'Rouvrir l’onglet fermé')
      const close = rows.find(({ entry }) => entry.label === 'Fermer l’onglet')
      expect(reopen?.entry.accelerator).toBe('CmdOrCtrl+Shift+T')
      expect(close?.entry.accelerator).toBe('CmdOrCtrl+W')
    }
  })

  it('garde le menu de l’application pour macOS seulement', () => {
    const mac = build('darwin')
    const macMenus = mac.filter(({ menu }) => menu === '').map(({ entry }) => entry.label)
    expect(macMenus[0]).toBe('Vela')
    for (const platform of ['win32', 'linux']) {
      const menus = build(platform)
        .filter(({ menu }) => menu === '')
        .map(({ entry }) => entry.label)
      expect(menus).not.toContain('Vela')
      expect(menus[0]).toBe('Fichier')
      expect(menus).toEqual([
        'Fichier',
        'Édition',
        'Affichage',
        'Historique',
        'Marque-pages',
        'Fenêtre',
        'Aide'
      ])
      // Pas de « Tout ramener au premier plan » hors macOS.
      expect(menus).not.toContain('front')
      expect(
        build(platform).some(({ entry }) => (entry as { role?: string }).role === 'front')
      ).toBe(false)
    }
  })

  it('déclare la recherche des notes et le résultat suivant', () => {
    for (const platform of PLATFORMS) {
      const rows = build(platform)
      expect(
        rows.find(({ entry }) => entry.label === 'Rechercher dans les notes')?.entry.accelerator
      ).toBe('CmdOrCtrl+Shift+F')
      expect(
        rows.find(({ entry }) => entry.label === 'Résultat suivant dans les notes')?.entry
          .accelerator
      ).toBe('CmdOrCtrl+G')
    }
  })

  it('envoie l’action au clic sur chaque plateforme', () => {
    for (const platform of PLATFORMS) {
      const sent: string[] = []
      const rows = build(platform, sent)
      rows.find(({ entry }) => entry.label === 'Nouvel onglet')?.entry.click?.()
      rows.find(({ entry }) => entry.label === 'Atelier')?.entry.click?.()
      expect(sent).toEqual(['new-tab', 'work'])
    }
  })
})
