import { describe, expect, it } from 'vitest'
import {
  letterboxdFeedUrl,
  logDateLabel,
  parseLetterboxdLog,
  sanitizeLetterboxdLog
} from './letterboxd'
import { NETWORK_FLOWS } from './network'

const RSS = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:letterboxd="https://letterboxd.com" xmlns:tmdb="https://themoviedb.org">
  <channel>
    <title>alessio’s Letterboxd diary</title>
    <item>
      <title>Perfect Days, 2023 - ★★★★½</title>
      <link>https://letterboxd.com/alessio/film/perfect-days/</link>
      <guid isPermaLink="false">letterboxd-review-11</guid>
      <pubDate>Sun, 27 Oct 2024 18:00:00 +0000</pubDate>
      <letterboxd:watchedDate>2024-10-25</letterboxd:watchedDate>
      <letterboxd:rewatch>No</letterboxd:rewatch>
      <letterboxd:filmTitle>Perfect Days</letterboxd:filmTitle>
      <letterboxd:filmYear>2023</letterboxd:filmYear>
      <letterboxd:memberRating>4.5</letterboxd:memberRating>
      <description><![CDATA[ <p>Un film calme &amp; juste.</p> ]]></description>
    </item>
    <item>
      <title>Dune : Deuxième partie, 2024 - ★★★★</title>
      <link>https://letterboxd.com/alessio/film/dune-part-two/</link>
      <guid isPermaLink="false">letterboxd-review-12</guid>
      <letterboxd:watchedDate>2024-10-20</letterboxd:watchedDate>
      <letterboxd:rewatch>Yes</letterboxd:rewatch>
      <letterboxd:filmTitle>Dune &amp; la suite</letterboxd:filmTitle>
      <letterboxd:filmYear>2024</letterboxd:filmYear>
    </item>
    <item>
      <title>Sans notes, 2019</title>
      <link>https://letterboxd.com/alessio/film/sans-notes/</link>
      <guid isPermaLink="false">letterboxd-review-13</guid>
      <letterboxd:filmTitle>Sans notes</letterboxd:filmTitle>
      <letterboxd:filmYear>2019</letterboxd:filmYear>
    </item>
  </channel>
</rss>`

describe('lecture du flux Letterboxd', () => {
  it('lit titre, année, note, date et rewatch', () => {
    const entries = parseLetterboxdLog(RSS)
    expect(entries).toHaveLength(3)
    expect(entries[0]).toMatchObject({
      id: 'letterboxd-review-11',
      title: 'Perfect Days',
      year: 2023,
      rating: 4.5,
      watchedDate: '2024-10-25',
      rewatch: false,
      url: 'https://letterboxd.com/alessio/film/perfect-days/'
    })
    expect(entries[1]).toMatchObject({
      title: 'Dune & la suite',
      rating: 4,
      rewatch: true
    })
    expect(entries[2]).toMatchObject({ title: 'Sans notes', rating: null, watchedDate: null })
  })

  it('ignore une entrée sans titre et fond les doublons de guid', () => {
    const xml = `<rss><channel>
      <item><title> </title><guid>a</guid></item>
      <item><title>Film A, 2020 - ★★★</title><guid>same</guid></item>
      <item><title>Film B, 2021 - ★★★</title><guid>same</guid></item>
    </channel></rss>`
    const entries = parseLetterboxdLog(xml)
    expect(entries.map((entry) => entry.title)).toEqual(['Film A'])
  })

  it('ne garde pas une note hors bornes', () => {
    const xml = `<rss><channel><item>
      <title>Film, 2020</title>
      <letterboxd:filmTitle>Film</letterboxd:filmTitle>
      <letterboxd:memberRating>9.5</letterboxd:memberRating>
    </item></channel></rss>`
    expect(parseLetterboxdLog(xml)[0]?.rating).toBeNull()
  })

  it('refuse un lien qui ne pointe pas vers Letterboxd', () => {
    const xml = `<rss><channel><item>
      <title>Film, 2020</title>
      <link>https://exemple.test/film/</link>
      <guid>x</guid>
    </item></channel></rss>`
    expect(parseLetterboxdLog(xml)[0]?.url).toBeNull()
    expect(sanitizeLetterboxdLog([{ id: 'x', title: 'Film', url: 'http://exemple.test/' }])[0]?.url).toBeNull()
  })
})

describe('journal stocké', () => {
  it('borne les champs au lieu de faire confiance au fichier', () => {
    const cleaned = sanitizeLetterboxdLog([
      { id: 'a', title: 'Film', year: 1200, rating: 9, watchedDate: '2024-13-40', rewatch: 'yes' },
      { id: 'a', title: 'Doublon' },
      { title: 'Sans identifiant' }
    ])
    expect(cleaned).toHaveLength(1)
    expect(cleaned[0]).toMatchObject({ year: null, rating: null, watchedDate: null, rewatch: false })
  })

  it('garde l’ordre du flux, du plus récent au plus ancien', () => {
    const cleaned = sanitizeLetterboxdLog(
      Array.from({ length: 250 }, (_, index) => ({ id: `e-${index}`, title: `Film ${index}` }))
    )
    expect(cleaned).toHaveLength(200)
    expect(cleaned[0]?.title).toBe('Film 0')
  })
})

describe('adresse et libellés', () => {
  it('construit le flux public sans accepter un nom douteux', () => {
    expect(letterboxdFeedUrl('@Alessio')).toBe('https://letterboxd.com/alessio/rss/')
    expect(letterboxdFeedUrl('a')).toBeNull()
    expect(letterboxdFeedUrl('nom/../autre')).toBeNull()
    expect(letterboxdFeedUrl(null)).toBeNull()
  })

  it('affiche une date courte, lisible', () => {
    expect(logDateLabel('2024-10-25')).toBe('25 oct. 2024')
    expect(logDateLabel(null)).toBe('')
    expect(logDateLabel('demain')).toBe('')
  })
})

describe('audit réseau', () => {
  it('déclare l’import du journal comme une destination à part', () => {
    const flow = NETWORK_FLOWS.find((entry) => entry.id === 'letterboxd-journal')
    expect(flow, 'le flux letterboxd-journal doit exister').toBeTruthy()
    expect(flow?.hosts).toContain('letterboxd.com')
    expect(flow?.trigger).toMatch(/Importer/)
    expect(flow?.off, 'un moyen de couper le flux').toBeTruthy()
  })
})
