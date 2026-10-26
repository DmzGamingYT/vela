/**
 * Extrait glissé depuis une page : le processus principal écrit un petit
 * Markdown avec un en-tête `source` / `titre`, que le panneau Notes relit.
 * Aucune donnée n'est interprétée au-delà de ces deux champs.
 */
export interface DroppedExcerpt {
  title?: string
  url?: string
  body: string
}

export function parseDroppedExcerpt(raw: string): DroppedExcerpt {
  const front = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!front) return { body: raw.trim() }
  const fields: Record<string, string> = {}
  for (const line of front[1].split(/\r?\n/)) {
    const index = line.indexOf(':')
    if (index === -1) continue
    const key = line.slice(0, index).trim().toLowerCase()
    const value = line.slice(index + 1).trim()
    if (key) fields[key] = value
  }
  const url = fields.source || fields.url
  return {
    title: fields.titre || fields.title,
    url: url && /^https?:\/\//i.test(url) ? url : undefined,
    body: raw.slice(front[0].length).trim()
  }
}
