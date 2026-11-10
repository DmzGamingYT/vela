import { describe, expect, it } from 'vitest'
import { bookmarksToHtml, parseBookmarksHtml, safeBookmarkUrl } from './bookmarksHtml'

describe('import de favoris HTML', () => {
  it('lit les liens d’un fichier Netscape', () => {
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
    <DT><A HREF="https://vela.local/" ADD_DATE="1700000000">Vela</A>
    <DT><A HREF='https://exemple.fr/a?b=1&amp;c=2'>Exemple &amp; Cie</A>
</DL><p>`
    expect(parseBookmarksHtml(html)).toEqual([
      { title: 'Vela', url: 'https://vela.local/' },
      { title: 'Exemple & Cie', url: 'https://exemple.fr/a?b=1&c=2' }
    ])
  })

  it('ignore les adresses dangereuses', () => {
    const html = `
      <A HREF="javascript:alert(1)">JS</A>
      <A HREF="data:text/html,<script>alert(1)</script>">Data</A>
      <A HREF="file:///etc/passwd">Fichier</A>
      <A HREF="chrome://settings">Interne</A>
      <A HREF="https://exemple.fr/">Sain</A>`
    expect(parseBookmarksHtml(html)).toEqual([{ title: 'Sain', url: 'https://exemple.fr/' }])
    expect(safeBookmarkUrl(' javascript:alert(1) ')).toBeNull()
    expect(safeBookmarkUrl('http://exemple.fr/x')).toBe('http://exemple.fr/x')
  })

  it('dédoublonne par adresse et garde le titre décodé une fois', () => {
    const html = `
      <A HREF="https://exemple.fr/">Un &amp;lt; deux</A>
      <A HREF="https://exemple.fr/">Doublon</A>`
    expect(parseBookmarksHtml(html)).toEqual([
      { title: 'Un &lt; deux', url: 'https://exemple.fr/' }
    ])
  })

  it('tolère un fichier vide ou bricolé', () => {
    expect(parseBookmarksHtml('')).toEqual([])
    expect(parseBookmarksHtml('<DL><p></DL>')).toEqual([])
    expect(parseBookmarksHtml('<A>sans adresse</A>')).toEqual([])
  })
})

describe('export de favoris HTML', () => {
  it('produit un fichier Netscape lisible et échappé', () => {
    const html = bookmarksToHtml(
      [
        { title: 'Vela & Cie', url: 'https://exemple.fr/?a=1&b=2' },
        { title: 'Interdit', url: 'javascript:alert(1)' }
      ],
      new Date('2026-11-05T10:00:00Z')
    )
    expect(html).toContain('<!DOCTYPE NETSCAPE-Bookmark-file-1>')
    expect(html).toContain('HREF="https://exemple.fr/?a=1&amp;b=2"')
    expect(html).toContain('>Vela &amp; Cie</A>')
    expect(html).not.toContain('javascript:')
    const roundTrip = parseBookmarksHtml(html)
    expect(roundTrip).toEqual([{ title: 'Vela & Cie', url: 'https://exemple.fr/?a=1&b=2' }])
  })
})
