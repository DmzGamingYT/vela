/**
 * Politique d'accès aux canaux IPC.
 *
 * Trois renderers coexistent : la coque (interface), la barre de la petite
 * fenêtre, et les pages web. Une page n'a aucune raison de lire les réglages
 * ou d'écrire des notes ; elle ne garde que les canaux dont son preload a
 * besoin. Un renderer inconnu n'obtient rien.
 */
export type SenderKind = 'shell' | 'mini' | 'page' | 'unknown'

/** Canaux appelés depuis le preload des pages (`src/preload/page.ts`). */
export const PAGE_CHANNELS: readonly string[] = [
  'comic:image',
  'comic:translate',
  'notes:capture-selection',
  'notes:drag-selection'
]

const PAGE_SET = new Set(PAGE_CHANNELS)

/** Classe un identifiant de WebContents ; tout le reste est une page. */
export function senderKindOf(
  senderId: number | null | undefined,
  ids: { shell?: number | null; mini?: number | null }
): SenderKind {
  if (typeof senderId !== 'number') return 'unknown'
  if (typeof ids.shell === 'number' && senderId === ids.shell) return 'shell'
  if (typeof ids.mini === 'number' && senderId === ids.mini) return 'mini'
  return 'page'
}

/** true si ce type d'émetteur peut utiliser ce canal. */
export function canUseChannel(kind: SenderKind, channel: string): boolean {
  if (kind === 'shell') return true
  if (kind === 'mini') return channel.startsWith('mini:')
  if (kind === 'page') return PAGE_SET.has(channel)
  return false
}
