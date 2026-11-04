import { describe, expect, it } from 'vitest'
import type { UpdateInfo } from './api'
import {
  compareVersions,
  isNewerVersion,
  latestAssetUrl,
  linuxAppImageNames,
  macInstallerNames,
  parseManifest,
  releaseAssetUrl,
  safeVersion,
  updateActionLabel,
  updateDescription,
  updateNotice,
  updateReadyMessage
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
    expect(macInstallerNames('0.3.9', 'arm64')).toEqual([
      'Vela-0.3.9-arm64.dmg',
      'Vela-0.3.9-universal.dmg'
    ])
    expect(macInstallerNames('0.3.9', 'x64')).toEqual([
      'Vela-0.3.9-x64.dmg',
      'Vela-0.3.9-universal.dmg'
    ])
  })

  it('se rabat sur l’universelle pour une architecture inconnue', () => {
    expect(macInstallerNames('0.3.9', 'ia32')).toEqual(['Vela-0.3.9-universal.dmg'])
  })

  it('nettoie un préfixe v et refuse une version vide', () => {
    expect(macInstallerNames('v0.4.0', 'arm64')).toEqual([
      'Vela-0.4.0-arm64.dmg',
      'Vela-0.4.0-universal.dmg'
    ])
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

describe('latestAssetUrl', () => {
  it('lit la dernière release stable, sans jeton GitHub', () => {
    expect(latestAssetUrl('latest-linux.yml')).toBe(
      'https://github.com/DmzGamingYT/vela/releases/latest/download/latest-linux.yml'
    )
  })
})

describe('linuxAppImageNames', () => {
  it('emploie le nom d’architecture produit par electron-builder', () => {
    expect(linuxAppImageNames('0.3.23', 'x64')).toEqual(['Vela-0.3.23-x86_64.AppImage'])
    expect(linuxAppImageNames('v0.3.23', 'arm64')).toEqual(['Vela-0.3.23-arm64.AppImage'])
  })

  it('ne propose rien pour une architecture inconnue ou une version vide', () => {
    expect(linuxAppImageNames('0.3.23', 'ia32')).toEqual([])
    expect(linuxAppImageNames('  ', 'x64')).toEqual([])
  })
})

describe('compareVersions', () => {
  it('compare numériquement, pas alphabétiquement', () => {
    expect(compareVersions('0.3.23', '0.3.9')).toBeGreaterThan(0)
    expect(compareVersions('0.4', '0.3.23')).toBeGreaterThan(0)
    expect(compareVersions('v0.3.23', '0.3.23')).toBe(0)
    expect(compareVersions('0.3.22', '0.3.23')).toBeLessThan(0)
    expect(isNewerVersion('0.3.23', '0.3.23')).toBe(false)
  })
})

describe('parseManifest', () => {
  it('lit latest-linux.yml comme latest-mac.yml', () => {
    const manifest = parseManifest(`version: 0.3.23
files:
  - url: Vela-0.3.23-x86_64.AppImage
    sha512: 8CSOPTx267IbKww6ahaymub6N9zv46s0oztfmku4z6xcaZuath1+dpGOaC8exDa2RY14QXAW9srMw01obMs4nA==
    size: 126719285
    blockMapSize: 132425
  - url: Vela-0.3.23-amd64.deb
    sha512: pNQKSk4jqYnew14CX+KDS2yVkwB9uwdWxY4WRpBx9ORdSG9GzVlhCTXHu1vtVAGKKvWKabDHl5STMnwLuOWIcA==
    size: 101489932
path: Vela-0.3.23-x86_64.AppImage
sha512: 8CSOPTx267IbKww6ahaymub6N9zv46s0oztfmku4z6xcaZuath1+dpGOaC8exDa2RY14QXAW9srMw01obMs4nA==
releaseDate: '2026-11-03T17:44:02.002Z'
`)
    expect(manifest?.version).toBe('0.3.23')
    expect(manifest?.files).toHaveLength(2)
    expect(manifest?.files[0]).toMatchObject({
      url: 'Vela-0.3.23-x86_64.AppImage',
      size: 126719285
    })
    expect(manifest?.files[1].url).toBe('Vela-0.3.23-amd64.deb')
  })
})

describe('updateNotice', () => {
  it('ne dit rien pendant un contrôle silencieux ni quand tout est à jour', () => {
    expect(updateNotice(null, 'darwin')).toBeNull()
    expect(updateNotice(info({ state: 'idle' }), 'darwin')).toBeNull()
    expect(updateNotice(info({ state: 'not-available' }), 'darwin')).toBeNull()
  })

  it('propose d’installer sur macOS et de redémarrer ailleurs', () => {
    expect(updateNotice(info({}), 'darwin')).toEqual({
      label: 'Mise à jour 0.3.9 prête',
      action: 'install'
    })
    expect(updateNotice(info({}), 'win32')).toEqual({
      label: 'Mise à jour 0.3.9 prête',
      action: 'restart'
    })
  })

  it('suit la progression sans action tant que ce n’est pas prêt', () => {
    expect(updateNotice(info({ state: 'downloading', progress: 42 }), 'darwin')).toEqual({
      label: 'Mise à jour 0.3.9 · 42 %',
      action: null
    })
  })
})

describe('updateDescription', () => {
  it('dit la vérité sur macOS : le .dmg reste à installer', () => {
    expect(updateDescription(info({}), 'darwin')).toContain('glissez Vela dans Applications')
    expect(updateDescription(info({}), 'win32')).toContain('s’installe à la fermeture')
  })

  it('ne promet pas d’installation silencieuse depuis un .deb', () => {
    expect(updateDescription(info({}), 'linux')).toContain('réinstallez le fichier téléchargé')
    expect(updateReadyMessage(info({}), 'linux')).toContain('.deb')
    expect(updateReadyMessage(info({}), 'darwin')).toContain('Installer')
    expect(updateReadyMessage(info({}), 'win32')).toContain('quitterez Vela')
  })

  it('nomme l’action attendue', () => {
    expect(updateActionLabel('install')).toBe('Installer')
    expect(updateActionLabel('restart')).toBe('Redémarrer maintenant')
  })

  it('retombe sur un texte neutre sans information', () => {
    expect(updateDescription(null, 'darwin')).toBe('Mises à jour automatiques en arrière-plan')
    expect(updateDescription(info({ state: 'error', message: 'Réseau absent' }), 'darwin')).toBe(
      'Réseau absent'
    )
  })
})
