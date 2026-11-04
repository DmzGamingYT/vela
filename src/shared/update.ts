import type { UpdateInfo } from './api'

/** Dépôt public des releases : la même source que celle des mises à jour. */
const OWNER = 'DmzGamingYT'
const REPO = 'vela'

/** Une version utilisable dans une URL, sans chemin possible. */
export function safeVersion(version: string): string {
  return version
    .trim()
    .replace(/^v/i, '')
    .replace(/[^0-9A-Za-z.-]/g, '')
}

/**
 * Installateurs macOS publiés, du plus précis au plus général : la version de
 * l'architecture d'abord, l'universelle ensuite. Les noms suivent
 * `artifactName` d'electron-builder, et `macInstallerNames` sert aussi à
 * vérifier qu'un fichier annoncé existe bien avant de le proposer.
 */
export function macInstallerNames(version: string, arch: string): string[] {
  const clean = safeVersion(version)
  if (!clean) return []
  const names: string[] = []
  if (arch === 'arm64' || arch === 'x64') names.push(`Vela-${clean}-${arch}.dmg`)
  names.push(`Vela-${clean}-universal.dmg`)
  return names
}

export function releaseAssetUrl(version: string, asset: string): string {
  return `https://github.com/${OWNER}/${REPO}/releases/download/v${safeVersion(version)}/${asset}`
}

/**
 * Manifeste de la dernière release publiée. GitHub redirige `latest` vers la
 * release stable courante : c'est ce que lit le contrôle Linux, sans passer
 * par l'API (donc sans jeton ni quota).
 */
export function latestAssetUrl(asset: string): string {
  return `https://github.com/${OWNER}/${REPO}/releases/latest/download/${asset}`
}

/**
 * Nom de l'AppImage produit par electron-builder : sur Linux, `${arch}` vaut
 * `x86_64` (et non `x64`), et `arm64` sur ARM.
 */
export function linuxAppImageName(version: string, arch: string): string | null {
  const clean = safeVersion(version)
  if (!clean) return null
  const suffix = arch === 'x64' ? 'x86_64' : arch === 'arm64' ? 'arm64' : null
  return suffix ? `Vela-${clean}-${suffix}.AppImage` : null
}

export function linuxAppImageNames(version: string, arch: string): string[] {
  const name = linuxAppImageName(version, arch)
  return name ? [name] : []
}

/** Compare deux versions numériques (`0.3.23` > `0.3.9`). */
export function compareVersions(a: string, b: string): number {
  const parts = (value: string): number[] =>
    safeVersion(value)
      .split('.')
      .map((part) => Number.parseInt(part, 10) || 0)
  const left = parts(a)
  const right = parts(b)
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

export function isNewerVersion(candidate: string, current: string): boolean {
  return compareVersions(candidate, current) > 0
}

export interface MacManifestFile {
  url: string
  sha512: string
  size: number
}

export interface MacManifest {
  version: string
  files: MacManifestFile[]
}

/**
 * Lit le `latest-mac.yml` publié par electron-builder. Format volontairement
 * simple : une version, puis une liste de fichiers avec empreinte et taille.
 * Retourne null dès qu'une entrée manque ou n'est pas exploitable — mieux vaut
 * refuser un installateur que le proposer sans preuve.
 */
export function parseMacManifest(text: string): MacManifest | null {
  const lines = text.split(/\r?\n/)
  const versionLine = lines.find((line) => /^version:\s*\S/.test(line))
  const version = versionLine
    ?.replace(/^version:\s*/, '')
    .trim()
    .replace(/^['"]|['"]$/g, '')
  if (!version) return null

  const files: MacManifestFile[] = []
  let current: Partial<MacManifestFile> | null = null
  const flush = (): void => {
    if (!current) return
    if (current.url && current.sha512 && typeof current.size === 'number') {
      files.push({ url: current.url, sha512: current.sha512, size: current.size })
    }
    current = null
  }

  for (const line of lines) {
    const item = line.match(/^\s*-\s+url:\s*(.+?)\s*$/)
    if (item) {
      flush()
      current = { url: item[1].replace(/^['"]|['"]$/g, '') }
      continue
    }
    if (!current) continue
    const hash = line.match(/^\s+sha512:\s*(.+?)\s*$/)
    if (hash) {
      current.sha512 = hash[1].replace(/^['"]|['"]$/g, '')
      continue
    }
    const size = line.match(/^\s+size:\s*(\d+)\s*$/)
    if (size) current.size = Number(size[1])
  }
  flush()

  if (files.length === 0) return null
  return { version, files }
}

/** Entrée du manifeste pour un nom de fichier donné, ou null. */
export function manifestFile(manifest: MacManifest | null, name: string): MacManifestFile | null {
  if (!manifest) return null
  return manifest.files.find((file) => file.url === name) ?? null
}

/** `latest-mac.yml` et `latest-linux.yml` partagent exactement ce format. */
export const parseManifest = parseMacManifest

export type UpdateAction = 'install' | 'restart'

export interface UpdateNotice {
  label: string
  action: UpdateAction | null
}

/**
 * Ce que la barre d'état affiche : rien pendant un simple contrôle silencieux,
 * quelque chose dès qu'un téléchargement avance ou qu'une version est prête.
 */
export function updateNotice(info: UpdateInfo | null, platform: string): UpdateNotice | null {
  if (!info) return null
  const version = info.version ? ` ${info.version}` : ''
  switch (info.state) {
    case 'downloaded':
      return {
        label: `Mise à jour${version} prête`,
        action: platform === 'darwin' ? 'install' : 'restart'
      }
    case 'downloading':
      return { label: `Mise à jour${version} · ${info.progress} %`, action: null }
    case 'available':
      return { label: `Mise à jour${version} en préparation`, action: null }
    case 'checking':
      return { label: 'Recherche de mise à jour', action: null }
    default:
      return null
  }
}

export function updateActionLabel(action: UpdateAction): string {
  return action === 'install' ? 'Installer' : 'Redémarrer maintenant'
}

/**
 * Le texte de Réglages › À propos. Sur macOS, l'installation n'est pas
 * silencieuse — Gatekeeper refuse un bundle non signé — donc on dit
 * exactement ce qu'il reste à faire, sans promettre l'inverse.
 */
export function updateDescription(info: UpdateInfo | null, platform: string): string {
  if (!info) return 'Mises à jour automatiques en arrière-plan'
  const mac = platform === 'darwin'
  const version = info.version ?? 'La mise à jour'
  switch (info.state) {
    case 'checking':
      return 'Vérification…'
    case 'available':
      return mac
        ? `Vela ${info.version ?? ''} — préparation de l’installateur`.trim()
        : `Vela ${info.version ?? ''} — téléchargement en arrière-plan`.trim()
    case 'downloading':
      return `Téléchargement en arrière-plan ${info.progress} %`
    case 'downloaded':
      if (mac) {
        return `${version} est téléchargée. Installer ouvre le .dmg : glissez Vela dans Applications, puis relancez.`
      }
      // Un .deb installé dans /opt ne peut pas être remplacé sans les droits
      // d'administration : seule l'AppImage se remplace elle-même.
      if (platform === 'linux') {
        return `${version} est téléchargée et vérifiée. Depuis l’AppImage, Vela la remplace et redémarre ; depuis un paquet .deb, réinstallez le fichier téléchargé.`
      }
      return `${version} s’installe à la fermeture de Vela.`
    case 'not-available':
      return 'Vela est à jour'
    case 'error':
      return info.message ?? 'Mise à jour impossible'
    default:
      return 'Mises à jour automatiques en arrière-plan'
  }
}

/**
 * La notification brève affichée quand une version est prête. Elle dit ce qui
 * va réellement se passer : un .dmg à glisser sur macOS, une installation à la
 * fermeture sous Windows, et sous Linux seulement depuis l'AppImage.
 */
export function updateReadyMessage(info: UpdateInfo, platform: string): string {
  const version = info.version ? `${info.version} ` : ''
  if (platform === 'darwin') return `Mise à jour ${version}prête — « Installer » vous attend.`
  if (platform === 'linux') {
    return `Mise à jour ${version}prête — depuis l’AppImage, Vela la remplace et redémarre ; depuis un .deb, réinstallez le paquet.`
  }
  return `Mise à jour ${version}prête — elle s’installera quand vous quitterez Vela.`
}
