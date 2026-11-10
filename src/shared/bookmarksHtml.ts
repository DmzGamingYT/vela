/**
 * Import et export des marque-pages au format HTML « Netscape », celui que
 * produisent et lisent Chrome, Firefox, Safari et la plupart des gestionnaires.
 *
 * Le parseur est volontairement strict : seules les adresses http(s) sont
 * gardées, les entités sont décodées une fois, et rien n'est évalué. Un fichier
 * hostile ne peut donc produire qu'une liste de pages à ajouter.
 */

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0'
}

function decode(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, body: string) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' || body[1] === 'X'
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10)
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return match
      try {
        return String.fromCodePoint(code)
      } catch {
        return match
      }
    }
    return ENTITIES[body.toLowerCase()] ?? match
  })
}

function escape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export interface ParsedBookmark {
  title: string
  url: string
}

/** Adresse acceptable pour un marque-page : page web publique uniquement. */
export function safeBookmarkUrl(raw: string): string | null {
  const text = raw.trim()
  if (!/^https?:\/\//i.test(text) || text.length > 2000) return null
  try {
    const parsed = new URL(text)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    if (!parsed.hostname) return null
    return parsed.toString()
  } catch {
    return null
  }
}

/**
 * Extrait les liens d'un fichier de favoris. Les adresses dangereuses
 * (javascript:, data:, file:, intranet avec identifiants) sont ignorées, et
 * deux liens identiques ne produisent qu'une entrée.
 */
export function parseBookmarksHtml(html: string): ParsedBookmark[] {
  if (typeof html !== 'string' || !html) return []
  const out: ParsedBookmark[] = []
  const seen = new Set<string>()
  const anchor = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi
  for (const match of html.matchAll(anchor)) {
    const attributes = match[1]
    const href = attributes.match(/\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i)
    const rawUrl = href ? (href[2] ?? href[3] ?? href[4] ?? '') : ''
    const url = safeBookmarkUrl(decode(rawUrl))
    if (!url || seen.has(url)) continue
    seen.add(url)
    const text = decode(match[2].replace(/<[^>]*>/g, ' '))
      .replace(/\s+/g, ' ')
      .trim()
    out.push({ title: text.slice(0, 200) || url, url })
    if (out.length >= 2000) break
  }
  return out
}

/** Fichier HTML standard : lisible par Chrome, Firefox et Safari. */
export function bookmarksToHtml(
  entries: { title: string; url: string }[],
  date = new Date()
): string {
  const lines = entries
    .map((entry) => {
      const url = safeBookmarkUrl(entry.url)
      if (!url) return null
      const title = escape((entry.title || url).slice(0, 200))
      const stamp = Math.floor(date.getTime() / 1000)
      return `        <DT><A HREF="${escape(url)}" ADD_DATE="${stamp}">${title}</A>`
    })
    .filter((line): line is string => Boolean(line))

  return [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<!-- This is an automatically generated file.',
    '     It will be read and overwritten.',
    '     DO NOT EDIT! -->',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>Bookmarks</TITLE>',
    '<H1>Bookmarks</H1>',
    '<DL><p>',
    '    <DT><H3 ADD_DATE="0" LAST_MODIFIED="0">Vela</H3>',
    '    <DL><p>',
    ...lines,
    '    </DL><p>',
    '</DL><p>',
    ''
  ].join('\n')
}
