import { describe, expect, it } from 'vitest'
import type { UpdateInfo } from './api'
import {
  RELEASE_NOTES_PLACEHOLDER,
  installActionLabel,
  reduceStatusBar,
  statusBarView,
  type StatusBarUi
} from './statusBar'

const info = (over: Partial<UpdateInfo> = {}): UpdateInfo => ({
  state: 'downloaded',
  version: '0.3.26',
  currentVersion: '0.3.25',
  progress: 100,
  message: null,
  releaseUrl: 'https://github.com/DmzGamingYT/vela/releases/tag/v0.3.26',
  channel: 'mac',
  appImageWritable: true,
  ...over
})

const ui = (over: Partial<StatusBarUi> = {}): StatusBarUi => ({
  detailOpen: false,
  laterVersion: null,
  ...over
})

describe('libellé d’installation', () => {
  it('suit le geste réel de chaque plateforme', () => {
    expect(installActionLabel('windows')).toBe('Installer et redémarrer')
    expect(installActionLabel('mac')).toBe('Ouvrir le DMG')
    expect(installActionLabel('appimage', true)).toBe('Installer et redémarrer')
    expect(installActionLabel('appimage', false)).toBe('Afficher l’AppImage')
    expect(installActionLabel('linux-package')).toBe('Afficher l’AppImage')
  })
})

describe('vue de la barre de statut', () => {
  it('affiche la version prête et son libellé d’installation', () => {
    const model = statusBarView(info(), 'darwin', ui())
    expect(model).toMatchObject({
      phase: 'ready',
      version: '0.3.26',
      readyLabel: 'Mise à jour 0.3.26 prête',
      installLabel: 'Ouvrir le DMG',
      summary: RELEASE_NOTES_PLACEHOLDER
    })
  })

  it('ouvre le détail sans perdre l’état prêt', () => {
    expect(statusBarView(info(), 'darwin', ui({ detailOpen: true }))).toMatchObject({
      phase: 'detail',
      detailTitle: 'Vela 0.3.26 est prête'
    })
  })

  it('considère une préparation comme un téléchargement', () => {
    const model = statusBarView(info({ state: 'available', progress: 0 }), 'darwin', ui())
    expect(model).toMatchObject({ phase: 'downloading', progress: 0 })
  })

  it('borne la progression réelle entre 0 et 100', () => {
    expect(
      statusBarView(info({ state: 'downloading', progress: 142 }), 'darwin', ui())?.progress
    ).toBe(100)
    expect(
      statusBarView(info({ state: 'downloading', progress: -8 }), 'darwin', ui())?.progress
    ).toBe(0)
    expect(
      statusBarView(info({ state: 'downloading', progress: 42.4 }), 'darwin', ui())?.progress
    ).toBe(42)
  })

  it('garde un message d’erreur court et l’état de réessai', () => {
    expect(
      statusBarView(info({ state: 'error', message: 'Réseau indisponible.' }), 'darwin', ui())
    ).toMatchObject({ phase: 'error', error: 'Réseau indisponible.' })
  })

  it('cache la version reportée, mais pas une autre version', () => {
    expect(statusBarView(info(), 'darwin', ui({ laterVersion: '0.3.26' }))).toBeNull()
    expect(statusBarView(info(), 'darwin', ui({ laterVersion: '0.3.25' }))).not.toBeNull()
  })

  it('ne montre rien pour un téléchargement annulé ou un simple contrôle', () => {
    expect(statusBarView(info({ state: 'cancelled' }), 'darwin', ui())).toBeNull()
    expect(statusBarView(info({ state: 'checking' }), 'darwin', ui())).toBeNull()
  })

  it('emploie le canal réel plutôt que le système seul', () => {
    expect(statusBarView(info({ channel: 'windows' }), 'darwin', ui())?.installLabel).toBe(
      'Installer et redémarrer'
    )
  })
})

describe('machine à états locale', () => {
  it('ouvre et ferme le détail', () => {
    const opened = reduceStatusBar(ui(), { type: 'open' })
    expect(opened.detailOpen).toBe(true)
    expect(reduceStatusBar(opened, { type: 'close' }).detailOpen).toBe(false)
  })

  it('reporte une version et referme le détail', () => {
    expect(
      reduceStatusBar(ui({ detailOpen: true }), { type: 'later', version: '0.3.26' })
    ).toEqual({ detailOpen: false, laterVersion: '0.3.26' })
  })
})
