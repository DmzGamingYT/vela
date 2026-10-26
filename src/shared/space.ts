/**
 * Espaces : avatars, ambiances et modèles prêts à l'emploi.
 *
 * Aucune dépendance à Electron ni à React : les identifiants sont validés ici
 * (au chargement du disque comme à la création) et testés séparément. Une
 * valeur inconnue retombe toujours sur un rendu sûr.
 */

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
  if (raw.startsWith('image:data:')) {
    const data = raw.slice(6)
    if (data.length > MAX_AVATAR_LENGTH) return null
    return IMAGE_AVATAR.test(data) ? raw : null
  }
  return null
}

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
