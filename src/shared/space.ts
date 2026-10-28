/**
 * Espaces : avatars, ambiances et modèles prêts à l'emploi.
 *
 * Aucune dépendance à Electron ni à React : les identifiants sont validés ici
 * (au chargement du disque comme à la création) et testés séparément. Une
 * valeur inconnue retombe toujours sur un rendu sûr.
 */

import { GALLERY_BY_ID } from './avatarGallery'

export type SpaceBackground = 'none' | 'aurora' | 'mist' | 'ember' | 'night'

export interface SpaceAvatarMark {
  id: string
  label: string
  /** Tracé dans un viewBox 24×24, dessiné au trait. */
  path: string
}

export const SPACE_AVATARS: SpaceAvatarMark[] = [
  {
    id: 'spark',
    label: 'Étincelle',
    path: 'M12 3.2 13.9 8l4.9 1.9-4.9 1.9L12 16.6l-1.9-4.8L5.2 9.9 10.1 8Z'
  },
  { id: 'bolt', label: 'Éclair', path: 'M13 2 4 14h6l-1 8 9-12h-6Z' },
  {
    id: 'leaf',
    label: 'Feuille',
    path: 'M20 4C11 4 5 9 5 16c0 2 1 4 3 4 7 0 12-6 12-16ZM8 19c1-5 4-8 8-10'
  },
  { id: 'moon', label: 'Lune', path: 'M21 12.8A8.5 8.5 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z' },
  { id: 'wave', label: 'Onde', path: 'M2.5 15c3-6 6 0 9-3s6.5 2 9-3' },
  {
    id: 'orbit',
    label: 'Orbite',
    path: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17ZM3.5 12c0-1.9 3.8-3.4 8.5-3.4s8.5 1.5 8.5 3.4-3.8 3.4-8.5 3.4S3.5 13.9 3.5 12Z'
  },
  {
    id: 'grid',
    label: 'Grille',
    path: 'M4 4h7v7H4ZM13 4h7v7h-7ZM4 13h7v7H4ZM13 13h7v7h-7Z'
  },
  {
    id: 'flame',
    label: 'Flamme',
    path: 'M12 22c4 0 7-3 7-7 0-4-4-7-4-12-3 2-4 5-4 8-2-1-3-3-3-5-2 3-3 6-3 9 0 4 3 7 7 7Z'
  },
  { id: 'code', label: 'Code', path: 'm8 7-5 5 5 5M16 7l5 5-5 5' },
  {
    id: 'clap',
    label: 'Clap',
    // Clapperboard : plateau et clapet oblique, deux traits sur le clapet.
    // Le clapet incliné est ce qui reste lisible à 16 px.
    path: 'M3.5 10.9h17v6.4a1.8 1.8 0 0 1-1.8 1.8H5.3a1.8 1.8 0 0 1-1.8-1.8ZM4.4 10.3 6.1 5.6l13.7 1.6-1.9 4.7ZM9.3 8.3 8 10.3M13.5 8.8 12.2 10.8'
  }
]

export interface SpaceBackgroundPreset {
  id: SpaceBackground
  label: string
  detail: string
}

export const SPACE_BACKGROUNDS: SpaceBackgroundPreset[] = [
  { id: 'none', label: 'Aucune', detail: 'Le fond du thème' },
  { id: 'aurora', label: 'Aurore', detail: 'Nappes qui respirent' },
  { id: 'mist', label: 'Brume', detail: 'Voile en haut' },
  { id: 'ember', label: 'Braise', detail: 'Chaleur en bas' },
  { id: 'night', label: 'Nuit', detail: 'Fond approfondi' }
]

export interface SpacePreset {
  id: string
  label: string
  name: string
  color: string
  avatar: string
  background: SpaceBackground
}

/** Modèles en un clic : nom, teinte, avatar et ambiance cohérents. */
export const SPACE_PRESETS: SpacePreset[] = [
  {
    id: 'work',
    label: 'Travail',
    name: 'Travail',
    color: '#5B56D6',
    avatar: 'icon:grid',
    background: 'mist'
  },
  {
    id: 'personal',
    label: 'Vie personnelle',
    name: 'Personnel',
    color: '#3FA98A',
    avatar: 'icon:leaf',
    background: 'aurora'
  },
  {
    id: 'gaming',
    label: 'Gaming',
    name: 'Gaming',
    color: '#A88CFF',
    avatar: 'icon:bolt',
    background: 'night'
  },
  {
    id: 'study',
    label: 'Études',
    name: 'Études',
    color: '#E6B95C',
    avatar: 'icon:spark',
    background: 'ember'
  },
  {
    id: 'dev',
    label: 'Développement',
    name: 'Développement',
    color: '#4FB6D8',
    avatar: 'icon:code',
    background: 'aurora'
  },
  {
    id: 'cinema',
    label: 'Cinéma',
    name: 'Cinéma',
    // Rouge de rideau : la seule famille de teinte absente des autres modèles.
    color: '#C2503F',
    avatar: 'icon:clap',
    // Salle obscure : l’ambiance « Nuit » approfondit le fond sans le teinter.
    background: 'night'
  }
]

const ICON_IDS = new Set(SPACE_AVATARS.map((mark) => mark.id))
const BACKGROUND_IDS = new Set(SPACE_BACKGROUNDS.map((preset) => preset.id))
const IMAGE_AVATAR = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/
/** 128 px en JPEG tient largement sous cette limite, qui borne le disque. */
export const MAX_AVATAR_LENGTH = 140_000

export function isSpaceBackground(value: unknown): value is SpaceBackground {
  return typeof value === 'string' && BACKGROUND_IDS.has(value as SpaceBackground)
}

export function sanitizeSpaceBackground(value: unknown): SpaceBackground {
  return isSpaceBackground(value) ? value : 'none'
}

/**
 * Avatar stocké : `monogram` (initiales), `icon:<id>` ou une image en data URL.
 * Tout le reste est refusé — jamais d'URL distante ni de HTML.
 */
export function sanitizeSpaceAvatar(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const raw = value.trim()
  if (!raw) return null
  if (raw === 'monogram') return 'monogram'
  if (raw.startsWith('icon:')) {
    const id = raw.slice(5)
    return ICON_IDS.has(id) ? `icon:${id}` : null
  }
  if (raw.startsWith('gallery:')) {
    const id = raw.slice(8)
    return GALLERY_BY_ID.has(id) ? `gallery:${id}` : null
  }
  if (raw.startsWith('image:file:')) {
    const name = raw.slice(11)
    return AVATAR_FILE.test(name) ? `image:file:${name}` : null
  }
  if (raw.startsWith('image:data:')) {
    const data = raw.slice(6)
    if (data.length > MAX_AVATAR_LENGTH) return null
    return IMAGE_AVATAR.test(data) ? raw : null
  }
  return null
}

/** Identifiant de galerie d'un avatar, si c'en est un. */
export function avatarGalleryId(value: string | null | undefined): string | null {
  if (!value || !value.startsWith('gallery:')) return null
  const id = value.slice(8)
  return GALLERY_BY_ID.has(id) ? id : null
}

/** Nom de fichier d'un avatar stocké sur disque, si c'en est un. */
export function avatarFile(value: string | null | undefined): string | null {
  if (!value || !value.startsWith('image:file:')) return null
  const name = value.slice(11)
  return AVATAR_FILE.test(name) ? name : null
}

/** Nom de fichier accepté : empreinte hexadécimale et extension d'image. */
export const AVATAR_FILE = /^[a-f0-9]{16,64}\.(png|jpe?g|webp)$/
/** Taille maximale d'une photo d'avatar, une fois décodée. */
export const MAX_AVATAR_BYTES = 512 * 1024

export function avatarMark(id: string): SpaceAvatarMark | undefined {
  return SPACE_AVATARS.find((mark) => mark.id === id)
}

/** Image contenue dans un avatar stocké, ou null pour une icône/un monogramme. */
export function avatarImage(value: string | null | undefined): string | null {
  if (!value || !value.startsWith('image:data:')) return null
  return value.slice(6)
}

export function avatarIcon(value: string | null | undefined): SpaceAvatarMark | null {
  if (!value || !value.startsWith('icon:')) return null
  return avatarMark(value.slice(5)) ?? null
}

/* ------------------------------------------------------------------ */
/* Sites épinglés par espace                                          */
/* ------------------------------------------------------------------ */

export interface SpaceShortcut {
  id: string
  url: string
  title: string
}

/**
 * Plafond de sécurité, pas de confort : la barre défile au-delà de quelques
 * rangées, donc un espace chargé garde tous ses sites atteignables.
 */
export const MAX_SHORTCUTS = 200

interface ShortcutSeed {
  title: string
  url: string
}

/**
 * Jeux de sites proposés par type d'espace. Les clés sont les identifiants des
 * modèles (`SPACE_PRESETS`) pour qu'un modèle remplisse aussi sa barre.
 */
export const SPACE_SHORTCUT_SETS: Record<string, ShortcutSeed[]> = {
  work: [
    { title: 'Notion', url: 'https://www.notion.so' },
    { title: 'Gmail', url: 'https://mail.google.com' },
    { title: 'Google Drive', url: 'https://drive.google.com' },
    { title: 'Google Agenda', url: 'https://calendar.google.com' },
    { title: 'Slack', url: 'https://app.slack.com' }
  ],
  personal: [
    { title: 'Gmail', url: 'https://mail.google.com' },
    { title: 'YouTube', url: 'https://www.youtube.com' },
    { title: 'Wikipédia', url: 'https://fr.wikipedia.org' },
    { title: 'Le Monde', url: 'https://www.lemonde.fr' }
  ],
  gaming: [
    { title: 'Steam', url: 'https://store.steampowered.com' },
    { title: 'GeForce NOW', url: 'https://play.geforcenow.com' },
    { title: 'Discord', url: 'https://discord.com/app' },
    { title: 'YouTube', url: 'https://www.youtube.com' },
    { title: 'Twitch', url: 'https://www.twitch.tv' }
  ],
  study: [
    { title: 'Wikipédia', url: 'https://fr.wikipedia.org' },
    { title: 'Google Scholar', url: 'https://scholar.google.com' },
    { title: 'Notion', url: 'https://www.notion.so' },
    { title: 'OpenClassrooms', url: 'https://openclassrooms.com' },
    { title: 'YouTube', url: 'https://www.youtube.com' }
  ],
  dev: [
    { title: 'GitHub', url: 'https://github.com' },
    { title: 'Stack Overflow', url: 'https://stackoverflow.com' },
    { title: 'ChatGPT', url: 'https://chatgpt.com' },
    { title: 'MDN', url: 'https://developer.mozilla.org' },
    { title: 'Hacker News', url: 'https://news.ycombinator.com' }
  ],
  // Séances, critiques, journal et disponibilité : les six pages que sert
  // vraiment un espace cinéma, sans qu’aucune ne soit contactée par Vela.
  cinema: [
    { title: 'AlloCiné', url: 'https://www.allocine.fr' },
    { title: 'SensCritique', url: 'https://www.senscritique.com' },
    { title: 'Letterboxd', url: 'https://letterboxd.com' },
    { title: 'IMDb', url: 'https://www.imdb.com' },
    { title: 'JustWatch', url: 'https://www.justwatch.com/fr' },
    { title: 'MUBI', url: 'https://mubi.com/fr' }
  ]
}

function hash(value: string): string {
  let result = 5381
  for (let index = 0; index < value.length; index += 1) {
    result = ((result << 5) + result + value.charCodeAt(index)) >>> 0
  }
  return result.toString(36)
}

/** Adresse d'un raccourci : http(s) uniquement, schéma ajouté si absent. */
export function normalizeShortcutUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const value = raw.trim()
  if (!value) return null
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`
  try {
    const parsed = new URL(candidate)
    if (!/^https?:$/.test(parsed.protocol) || !parsed.hostname.includes('.')) return null
    return parsed.toString()
  } catch {
    return null
  }
}

function titleFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'Site'
  }
}

/**
 * Valide et normalise une barre de sites épinglés : doublons retirés, adresses
 * http(s) seulement, longueur bornée. Une entrée cassée ne casse pas la barre.
 */
export function sanitizeSpaceShortcuts(raw: unknown): SpaceShortcut[] {
  if (!Array.isArray(raw)) return []
  const shortcuts: SpaceShortcut[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const candidate = item as Partial<SpaceShortcut>
    const url = normalizeShortcutUrl(candidate.url)
    if (!url || seen.has(url)) continue
    seen.add(url)
    const title =
      typeof candidate.title === 'string' && candidate.title.trim()
        ? candidate.title.trim().slice(0, 80)
        : titleFromUrl(url)
    const id =
      typeof candidate.id === 'string' && /^[a-z0-9-]{4,40}$/i.test(candidate.id)
        ? candidate.id
        : `sc-${hash(url)}`
    shortcuts.push({ id, url, title })
    if (shortcuts.length >= MAX_SHORTCUTS) break
  }
  return shortcuts
}

/** Sites épinglés d'un modèle, prêts pour le stockage. */
export function shortcutsForSet(setId: string): SpaceShortcut[] {
  return sanitizeSpaceShortcuts(SPACE_SHORTCUT_SETS[setId] ?? [])
}

const SUGGESTIONS: { set: string; words: RegExp }[] = [
  {
    set: 'dev',
    words: /\b(dev|devops|developpement|developpeur|code|programmation|veille|tech|technique|informatique)\b/
  },
  { set: 'study', words: /\b(etude|etudes|ecole|universite|uni|fac|cours|lycee|these|memoire)\b/ },
  {
    set: 'cinema',
    words: /\b(cinema|films?|series?|movies?|serie|acteur|actrice|realisateur|realisation|plateau)\b/
  },
  { set: 'gaming', words: /\b(gaming|game|games|jeu|jeux|loisir|loisirs|stream)\b/ },
  { set: 'work', words: /\b(travail|boulot|pro|professionnel|bureau|equipe|job)\b/ },
  { set: 'personal', words: /\b(perso|personnel|famille|maison|vie)\b/ }
]

/**
 * Devine le jeu de sites à proposer d'après le nom saisi. Accents et casse
 * ignorés ; « veille » mène au développement, pas au travail.
 */
export function suggestShortcutSet(name: string): string | null {
  const clean = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
  for (const entry of SUGGESTIONS) {
    if (entry.words.test(clean)) return entry.set
  }
  return null
}

/* ------------------------------------------------------------------ */
/* Liste à voir et compte Letterboxd                                  */
/* ------------------------------------------------------------------ */

/** Un titre de la liste « À voir » d’un espace. Rien ne quitte la machine. */
export interface SpaceWatchItem {
  id: string
  title: string
  watched: boolean
  addedAt: number
}

/** Même plafond que les sites épinglés : au-delà, on ne garde pas la suite. */
export const MAX_WATCH_ITEMS = 200

/**
 * Valide une liste à voir : titres courts, doublons retirés (casse et espaces
 * ignorés), entrée cassée sautée. Un titre déjà lu garde sa marque.
 */
export function sanitizeWatchlist(raw: unknown): SpaceWatchItem[] {
  if (!Array.isArray(raw)) return []
  const items: SpaceWatchItem[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const candidate = item as Partial<SpaceWatchItem>
    const title = typeof candidate.title === 'string' ? candidate.title.trim().replace(/\s+/g, ' ') : ''
    if (!title) continue
    const clean = title.slice(0, 120)
    const key = clean.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const id =
      typeof candidate.id === 'string' && /^[a-z0-9-]{4,40}$/i.test(candidate.id)
        ? candidate.id
        : `watch-${hash(key)}`
    items.push({
      id,
      title: clean,
      watched: candidate.watched === true,
      addedAt: typeof candidate.addedAt === 'number' && candidate.addedAt > 0 ? candidate.addedAt : Date.now()
    })
    if (items.length >= MAX_WATCH_ITEMS) break
  }
  return items
}

/** Nom d’utilisateur Letterboxd : lettres, chiffres, tiret et souligné. */
const LETTERBOXD_USER = /^[a-z0-9][a-z0-9_-]{1,29}$/

/**
 * Normalise un nom de compte Letterboxd. Un « @ » ou une adresse complète est
 * toléré à la saisie, mais seul le nom est conservé : aucune URL n’est stockée,
 * donc aucune page ne peut être forcée.
 */
export function normalizeLetterboxd(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const raw = value.trim().replace(/^@/, '')
  if (!raw) return null
  // Une adresse collée n'est acceptée que si elle pointe vers Letterboxd :
  // sinon on ne saurait pas d'où vient le nom.
  if (/^https?:/i.test(raw)) {
    try {
      const url = new URL(raw)
      const host = url.hostname.toLowerCase()
      if (host !== 'letterboxd.com' && !host.endsWith('.letterboxd.com')) return null
      const parts = url.pathname.split('/').filter(Boolean)
      const name = (parts[0] ?? '').toLowerCase()
      return LETTERBOXD_USER.test(name) ? name : null
    } catch {
      return null
    }
  }
  const name = raw.toLowerCase()
  return LETTERBOXD_USER.test(name) ? name : null
}

/** Pages publiques d’un compte, ouvertes dans l’onglet et sa session. */
export const LETTERBOXD_PAGES = [
  { id: 'films', label: 'Films vus', path: '/films/' },
  { id: 'diary', label: 'Journal', path: '/films/diary/' },
  { id: 'watchlist', label: 'Ma liste', path: '/watchlist/' },
  { id: 'popular', label: 'Populaires cette semaine', path: '/films/popular/this/week/' }
] as const

/** Adresse d’une page Letterboxd pour ce compte, ou null sans compte valide. */
export function letterboxdUrl(user: string | null | undefined, path: string): string | null {
  const name = normalizeLetterboxd(user)
  if (!name) return null
  return `https://letterboxd.com/${name}${path}`
}

const PARTITION = /^persist:[a-z0-9._-]{1,64}$/i

/**
 * Partition Chromium à utiliser pour un espace, calculée à partir de son
 * identifiant quand le fichier n'en contient pas (ou une valeur douteuse).
 *
 * Chromium lève « conversion failure from undefined » si on lui passe autre
 * chose qu'une chaîne : chaque session passe donc par ici, y compris quand
 * l'espace vient d'un vela.json ancien. Deux espaces ne partagent jamais la
 * même partition, et le résultat est stable d'un lancement à l'autre.
 */
export function partitionFor(space: { id?: unknown; partition?: unknown } | null | undefined): string {
  const given = typeof space?.partition === 'string' ? space.partition.trim() : ''
  if (PARTITION.test(given)) return given
  const id =
    typeof space?.id === 'string'
      ? space.id
          .replace(/[^a-zA-Z0-9._-]/g, '')
          // Un identifiant fait de points ou de tirets ne donne pas un nom de
          // partition lisible : mieux vaut la session de secours.
          .replace(/^[._-]+/, '')
          .slice(0, 64)
      : ''
  return `persist:vela-${id || 'recovery'}`
}
