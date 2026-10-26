/**
 * Aperçu d'un rapport de l'atelier : la première phrase de prose, sans les
 * titres, listes et tableaux, assez courte pour tenir sur deux lignes.
 *
 * Calculé côté processus principal, une seule fois par version du rapport :
 * l'interface reçoit le résultat au lieu de le recalculer à chaque rendu.
 */
export function previewOf(markdown: string): string {
  const plain = (line: string): string =>
    line
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[*_`~]/g, '')
      .replace(/\s+/g, ' ')
      .trim()

  let fenced = false
  for (const line of markdown.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced
      continue
    }
    if (fenced) continue
    const trimmed = line.trim()
    if (!trimmed) continue
    if (/^(#{1,6}\s|>|[-*+]\s|\d+[.)]\s|\|)/.test(trimmed)) continue
    const text = plain(trimmed)
    if (text.length < 40) continue
    return text.length > 150 ? `${text.slice(0, 149)}…` : text
  }
  return ''
}
