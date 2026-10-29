export function greeting(date = new Date()): string {
  const hour = date.getHours()
  if (hour < 6) return 'Bonne nuit'
  if (hour < 12) return 'Bonjour'
  if (hour < 18) return 'Bel après-midi'
  return 'Bonsoir'
}

export function timeAgo(timestamp: number, now = Date.now()): string {
  const delta = Math.max(0, now - timestamp)
  const minutes = Math.floor(delta / 60_000)
  if (minutes < 1) return "à l'instant"
  if (minutes < 60) return `il y a ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `il y a ${hours} h`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'hier'
  if (days < 7) return `il y a ${days} j`
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(new Date(timestamp))
}

export function shortDate(timestamp: number): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(timestamp))
}

export function weekdayLabel(timestamp: number): string {
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(
    new Date(timestamp)
  )
}

export function initials(value: string): string {
  const clean = value.trim()
  if (!clean) return '·'
  const words = clean.split(/\s+/).filter(Boolean)
  if (words.length === 1) return clean.slice(0, 1).toUpperCase()
  const head = words[0][0] ?? ''
  const last = words[words.length - 1]
  // Un numéro final garde deux chiffres : « Favori 1 », « Favori 10 » et
  // « Favori 14 » ne peuvent pas partager la même pastille.
  const tail = /^\d/.test(last) ? last.slice(0, 2) : (last[0] ?? '')
  return `${head}${tail}`.toUpperCase()
}

const TINTS = ['#C8623E', '#2F6B5B', '#5058C8', '#B08230', '#7B4B6B', '#3D6E9E']

export function tintFor(seed: string): string {
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) hash = (hash * 31 + seed.charCodeAt(index)) % 9973
  return TINTS[hash % TINTS.length]
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Raccourci affiché selon la plateforme. */
export function shortcut(key: string): string {
  return window.vela?.platform === 'darwin' ? `⌘${key}` : `Ctrl+${key}`
}

export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count > 1 ? pluralForm : singular}`
}
