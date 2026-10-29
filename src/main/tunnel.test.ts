import { describe, expect, it, vi } from 'vitest'

// Le service importe Electron pour ses requêtes : les extracteurs testés ici
// sont purs et n'ouvrent aucune connexion.
vi.mock('electron', () => ({ net: { fetch: vi.fn() } }))

const { ANGLES, mainParagraphs, metaContent } = await import('./tunnel')

describe('extraction du texte d’une page', () => {
  it('n’extrait pas un paragraphe caché dans un script', () => {
    const html = `
      <html><head><title>Ma page</title></head>
      <body>
        <script>var ytBootstrapConfig = {"x":"<p>ytBootstrapConfig({\\"a\\":1})</p>"}</script>
        <p>Ce paragraphe est réellement affiché aux visiteurs, avec assez de mots pour passer le seuil de longueur minimal de l’extracteur.</p>
      </body></html>`
    const text = mainParagraphs(html)
    expect(text).toContain('réellement affiché')
    expect(text).not.toContain('ytBootstrapConfig')
  })

  it('ignore style, noscript et gabarits', () => {
    const html = `
      <style>.a::before { content: "<p>Une règle de style très longue qui ne doit jamais devenir un extrait de page lisible.</p>"; }</style>
      <noscript><p>Activez JavaScript pour voir ce contenu qui ne doit pas être l’extrait proposé par le tunnel de recherche.</p></noscript>
      <template><p>Un gabarit masqué qui contient lui aussi beaucoup de texte et ne doit pas apparaître dans l’extrait final.</p></template>
      <p>Le vrai paragraphe de la page, celui qu’un lecteur voit vraiment en arrivant sur cette adresse web.</p>`
    const text = mainParagraphs(html)
    expect(text).toContain('vrai paragraphe')
    expect(text).not.toContain('règle de style')
    expect(text).not.toContain('Activez JavaScript')
    expect(text).not.toContain('gabarit masqué')
  })

  it('lit og:description quel que soit l’ordre des attributs', () => {
    const before = '<meta content="Résumé de partage, écrit par la page." property="og:description">'
    const after = '<meta property="og:description" content="Résumé de partage, écrit par la page.">'
    expect(metaContent(before, 'og:description')).toBe('Résumé de partage, écrit par la page.')
    expect(metaContent(after, 'og:description')).toBe('Résumé de partage, écrit par la page.')
  })

  it('reconnaît aussi la description classique et celle de Twitter', () => {
    const html =
      '<meta name="description" content="Description classique."><meta name="twitter:description" content="Celle de Twitter.">'
    expect(metaContent(html, 'description')).toBe('Description classique.')
    expect(metaContent(html, 'twitter:description')).toBe('Celle de Twitter.')
  })

  it('décode les entités numériques décimales et hexadécimales', () => {
    const html = `<meta name="description" content="L&#x27;essentiel &#224; savoir &amp; plus">`
    expect(metaContent(html, 'description')).toBe("L'essentiel à savoir & plus")
  })

  it('ne confond pas une autre balise meta avec la description', () => {
    const html = '<meta property="og:title" content="Un titre"><meta name="viewport" content="width=device-width">'
    expect(metaContent(html, 'og:description')).toBeUndefined()
  })
})

describe('angles du tunnel', () => {
  it('nomme des lentilles de lecture, pas des types de source', () => {
    const titles = Object.values(ANGLES).map((angle) => angle.title)
    expect(titles).toHaveLength(5)
    expect(new Set(titles).size).toBe(titles.length)
    for (const forbidden of ['Sites web', 'Panorama', 'Travaux', 'Débats']) {
      expect(titles).not.toContain(forbidden)
    }
    // Chaque angle dit ce qu'il apporte au sujet.
    expect(titles).toContain('Définitions')
    expect(titles).toContain('Études')
  })
})
