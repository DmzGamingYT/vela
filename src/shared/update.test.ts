import { describe, expect, it } from 'vitest'
import type { UpdateInfo } from './api'
import {
  macInstallerNames,
  releaseAssetUrl,
  safeVersion,
  updateActionLabel,
  updateDescription,
  updateNotice
} from './update'

const info = (over: Partial<UpdateInfo>): UpdateInfo => ({
  state: 'downloaded',
  version: '0.3.9',
  currentVersion: '0.3.8',
  progress: 100,
  message: null,
  releaseUrl: 'https://github.com/DmzGamingYT/vela/releases/latest',
  ...over
})

describe('macInstallerNames', () => {
  it('propose d’abord la version de l’architecture, puis l’universelle', () => {
    expect(macInstallerNames('0.3.9', 'arm64')).toEqual(['Vela-0.3.9-arm64.dmg', 'Vela-0.3.9-universal.dmg'])
    expect(macInstallerNames('0.3.9', 'x64')).toEqual(['Vela-0.3.9-x64.dmg', 'Vela-0.3.9-universal.dmg'])
  })

  it('se rabat sur l’universelle pour une architecture inconnue', () => {
    expect(macInstallerNames('0.3.9', 'ia32')).toEqual(['Vela-0.3.9-universal.dmg'])
  })

  it('nettoie un préfixe v et refuse une version vide', () => {
    expect(macInstallerNames('v0.4.0', 'arm64')).toEqual(['Vela-0.4.0-arm64.dmg', 'Vela-0.4.0-universal.dmg'])
    expect(macInstallerNames('  ', 'arm64')).toEqual([])
  })
})

describe('releaseAssetUrl', () => {
  it('pointe l’artefact de la release, jamais ailleurs', () => {
    expect(releaseAssetUrl('0.3.9', 'Vela-0.3.9-arm64.dmg')).toBe(
      'https://github.com/DmzGamingYT/vela/releases/download/v0.3.9/Vela-0.3.9-arm64.dmg'
    )
  })

  it('empêche une version de sortir du chemin de la release', () => {
    expect(safeVersion('../../evil')).toBe('....evil')
    expect(releaseAssetUrl('1.0.0/../..', 'Vela-x.dmg')).toBe(
      'https://github.com/DmzGamingYT/vela/releases/download/v1.0.0..../Vela-x.dmg'
    )
  })
})

describe('updateNotice', () => {
  it('ne dit rien pendant un contrôle silencieux ni quand tout est à jour', () => {
    expect(updateNotice(null, true)).toBeNull()
    expect(updateNotice(info({ state: 'idle' }), true)).toBeNull()
    expect(updateNotice(info({ state: 'not-available' }), true)).toBeNull()
  })

  it('propose d’installer sur macOS et de redémarrer ailleurs', () => {
    expect(updateNotice(info({}), true)).toEqual({ label: 'Mise à jour 0.3.9 prête', action: 'install' })
    expect(updateNotice(info({}), false)).toEqual({ label: 'Mise à jour 0.3.9 prête', action: 'restart' })
  })

  it('suit la progression sans action tant que ce n’est pas prêt', () => {
    expect(updateNotice(info({ state: 'downloading', progress: 42 }), true)).toEqual({
      label: 'Mise à jour 0.3.9 · 42 %',
      action: null
    })
  })
})

describe('updateDescription', () => {
  it('dit la vérité sur macOS : le .dmg reste à installer', () => {
    expect(updateDescription(info({}), true)).toContain('glissez Vela dans Applications')
    expect(updateDescription(info({}), false)).toContain('s’installe à la fermeture')
  })

  it('nomme l’action attendue', () => {
    expect(updateActionLabel('install')).toBe('Installer')
    expect(updateActionLabel('restart')).toBe('Redémarrer maintenant')
  })

  it('retombe sur un texte neutre sans information', () => {
    expect(updateDescription(null, true)).toBe('Mises à jour automatiques en arrière-plan')
    expect(updateDescription(info({ state: 'error', message: 'Réseau absent' }), true)).toBe('Réseau absent')
  })
})
