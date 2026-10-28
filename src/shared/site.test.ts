import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { version } from '../../package.json'
import { NETWORK_FLOWS } from './network'

/**
 * Contrôle automatique du site vitrine. Il porte sur les cinq pages
 * déployées (site/public) et remplace la lecture d'une page unique : structure,
 * liens, images, version annoncée, flux réseau et promesses.
 *
 * Ces tests tournent avec `npm test`, donc en intégration continue : une page
 * supprimée, une ancre cassée ou une version en avance fait échouer la suite.
 */

const root = process.cwd()
const siteDir = join(root, 'site', 'public')
const PAGES = [
  { file: 'index.html', url: '/', nav: false },
  { file: 'navigateur/index.html', url: '/navigateur/', nav: true },
  { file: 'confidentialite/index.html', url: '/confidentialite/', nav: true },
  { file: 'aide/index.html', url: '/aide/', nav: true },
  { file: 'nouveautes/index.html', url: '/nouveautes/', nav: true }
] as const

const read = (file: string) => readFileSync(join(siteDir, file), 'utf8')
const texts = PAGES.map((page) => ({ ...page, html: read(page.file) }))

/** Résout une adresse interne vers le fichier qui la sert. */
const resolveInternal = (path: string): string | null => {
  const clean = path.replace(/\/$/, '')
  const candidates = clean === '' ? ['index.html'] : [`${clean.slice(1)}/index.html`, clean.slice(1)]
  for (const candidate of candidates) {
    const full = join(siteDir, candidate)
    if (existsSync(full) && statSync(full).isFile()) return full
  }
  return null
}

describe('site — structure des cinq pages', () => {
  it('a les cinq pages attendues', () => {
    for (const page of PAGES) {
      expect(existsSync(join(siteDir, page.file)), page.file).toBe(true)
    }
  })

  it('déclare la langue, le jeu de caractères et le viewport', () => {
    for (const page of texts) {
      expect(page.html, page.file).toMatch(/<html lang="fr"/)
      expect(page.html, page.file).toContain('<meta charset="utf-8" />')
      expect(page.html, page.file).toMatch(/name="viewport" content="width=device-width/)
    }
  })

  it('n’a qu’un seul titre de niveau 1 par page', () => {
    for (const page of texts) {
      const h1 = page.html.match(/<h1\b/g) || []
      expect(h1.length, page.file).toBe(1)
    }
  })

  it('n’a ni identifiant dupliqué ni ancre morte', () => {
    for (const page of texts) {
      const ids = [...page.html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1])
      const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))]
      expect(duplicates, `${page.file} : identifiants dupliqués`).toEqual([])

      for (const [, anchor] of page.html.matchAll(/href="#([^"]+)"/g)) {
        expect(ids, `${page.file} : ancre morte #${anchor}`).toContain(anchor)
      }
    }
  })

  it('résout tous les liens internes, y compris leurs ancres', () => {
    for (const page of texts) {
      const links = [...page.html.matchAll(/href="(\/[^"]*)"/g)].map((match) => match[1])
      for (const link of links) {
        const [path, hash] = link.split('#')
        const target = resolveInternal(path)
        expect(target, `${page.file} : lien mort ${path}`).not.toBeNull()
        if (hash && target) {
          expect(readFileSync(target, 'utf8'), `${page.file} : ancre morte ${link}`).toContain(`id="${hash}"`)
        }
      }
    }
  })

  it('charge des feuilles et un script qui existent', () => {
    for (const page of texts) {
      const assets = [
        ...page.html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g),
        ...page.html.matchAll(/<script src="([^"]+)"/g)
      ].map((match) => match[1])
      expect(assets.length, `${page.file} : aucune feuille`).toBeGreaterThanOrEqual(2)
      for (const asset of assets) {
        expect(resolveInternal(asset.startsWith('/') ? asset : `/${asset}`), `${page.file} : ${asset}`).not.toBeNull()
      }
    }
  })

  it('déclare des icônes de site qui existent', () => {
    for (const page of texts) {
      for (const [, href] of page.html.matchAll(/<link rel="(?:icon|apple-touch-icon)" href="([^"]+)"/g)) {
        expect(resolveInternal(href), `${page.file} : icône ${href}`).not.toBeNull()
      }
    }
  })

  it('donne un texte alternatif à chaque image, et une image existante', () => {
    for (const page of texts) {
      for (const [tag] of page.html.matchAll(/<img\b[^>]*>/g)) {
        expect(tag, `${page.file} : image sans texte alternatif`).toMatch(/alt="[^"]+"/)
        const [, src] = tag.match(/src="([^"]+)"/) || []
        expect(src, `${page.file} : source absente`).toBeTruthy()
        expect(resolveInternal(src as string), `${page.file} : image absente ${src}`).not.toBeNull()
      }
    }
  })
})

describe('site — navigation entre les pages', () => {
  it('propose les mêmes entrées sur les cinq pages', () => {
    for (const page of texts) {
      for (const target of ['/navigateur/', '/confidentialite/', '/aide/', '/nouveautes/']) {
        expect(page.html, `${page.file} : entrée ${target}`).toContain(`href="${target}"`)
      }
      expect(page.html, `${page.file} : retour à l’accueil`).toMatch(/<a class="brand" href="\/"/)
    }
  })

  it('marque la page courante dans le bandeau, et elle seule', () => {
    for (const page of texts) {
      const current = [...page.html.matchAll(/aria-current="page"/g)].length
      expect(current, page.file).toBe(page.nav ? 1 : 0)
    }
  })

  it('lie chaque page depuis le pied de page', () => {
    for (const page of texts) {
      const footer = page.html.slice(page.html.indexOf('<footer'))
      for (const target of ['/navigateur/', '/confidentialite/', '/aide/', '/nouveautes/']) {
        expect(footer, `${page.file} : pied de page sans ${target}`).toContain(`href="${target}"`)
      }
    }
  })
})

describe('site — version et téléchargements', () => {
  const home = texts[0].html
  /**
   * La version annoncée par la page, lue sur la page elle-même.
   *
   * Le site ne peut pas annoncer la version en cours avant sa publication :
   * les empreintes SHA-256 des installateurs n'existent qu'une fois les
   * fichiers construits. Il a donc le droit de retarder d'une version, jamais
   * de prendre de l'avance, et chaque mention doit dire la même chose.
   */
  const announced = (home.match(/Fichiers de la version ([\d.]+)/) || [])[1] || ''
  const files = [
    `Vela-${announced}-universal.dmg`,
    `Vela-${announced}-arm64.dmg`,
    `Vela-${announced}-x64.dmg`,
    `Vela-${announced}-x64.exe`,
    `Vela-${announced}-x86_64.AppImage`,
    `Vela-${announced}-amd64.deb`
  ]

  it('annonce une seule version, et jamais celle d’une version à venir', () => {
    expect(announced, 'version annoncée').toMatch(/^\d+\.\d+\.\d+$/)
    const compare = (a: string, b: string): number => {
      const left = a.split('.').map(Number)
      const right = b.split('.').map(Number)
      for (let index = 0; index < 3; index += 1) {
        if (left[index] !== right[index]) return left[index] - right[index]
      }
      return 0
    }
    expect(compare(announced, version), `site ${announced} en avance sur l’app ${version}`).toBeLessThanOrEqual(0)
    // Toutes les mentions du site disent la même version que le tableau.
    expect(home).toContain(`Vela ${announced}, pour les trois plateformes`)
    expect(home).toContain(`v0.${announced.split('.').slice(1).join('.')} · macOS, Windows, Linux`)
  })

  it('liste les six installateurs avec leur lien de release', () => {
    for (const file of files) {
      expect(home, file).toContain(file)
      expect(home, `${file} : lien`).toContain(`releases/download/v${announced}/${file}`)
    }
  })

  it('donne une empreinte SHA-256 par installateur, toutes différentes', () => {
    const sums = [...home.matchAll(/class="sum">([0-9a-f ]{11,})…/g)].map((match) => match[1].replace(/\s/g, ''))
    expect(sums.length).toBe(files.length)
    expect(new Set(sums).size).toBe(sums.length)
    for (const sum of sums) expect(sum).toMatch(/^[0-9a-f]{8,}$/)
  })

  it('n’annonce aucune version plus récente que la version courante', () => {
    const [major, minor, patch] = version.split('.').map(Number)
    const current = texts.find((page) => page.file === 'index.html') as (typeof texts)[number]
    const found = [...current.html.matchAll(/\b(\d+)\.(\d+)\.(\d+)\b/g)].map((match) => match.slice(1).map(Number))
    for (const [maj, min, rev] of found) {
      if (maj !== major) continue
      expect(min, `version ${maj}.${min}.${rev} d’une autre branche`).toBe(minor)
      expect(rev, `version ${maj}.${min}.${rev} annoncée en avance`).toBeLessThanOrEqual(patch)
    }
  })

  it('ne montre aucun reste de gabarit', () => {
    for (const page of texts) {
      expect(page.html, page.file).not.toMatch(/\{\{[A-Z_]+\}\}/)
    }
  })
})

describe('site — confidentialité alignée sur l’application', () => {
  const privacy = (texts.find((page) => page.file === 'confidentialite/index.html') || texts[0]).html

  it('décrit chaque flux de l’application, et rien de plus', () => {
    const listed = [...privacy.matchAll(/<span class="name">([^<]+)<\/span>/g)].map((match) => match[1])
    const expected = NETWORK_FLOWS.map((flow) => flow.label)
    expect([...expected].filter((label) => !listed.includes(label)), 'flux absents du site').toEqual([])
    expect([...listed].filter((label) => !expected.includes(label)), 'flux inconnus du site').toEqual([])
  })

  it('nomme les destinations que l’application contacte', () => {
    for (const flow of NETWORK_FLOWS) {
      expect(privacy, `${flow.label} : destination`).toContain(flow.target)
    }
  })

  it('cite chaque hôte littéral surveillé par l’audit réseau', () => {
    // Les hôtes figurent dans le texte des destinations ou dans les données
    // envoyées ; on vérifie au moins le domaine de tête de chacun.
    const hosts = NETWORK_FLOWS.flatMap((flow) => flow.hosts)
    for (const host of new Set(hosts)) {
      const base = host.replace(/^www\./, '').split('.').slice(-2).join('.')
      expect(privacy.toLowerCase(), `hôte absent : ${host}`).toContain(base.toLowerCase())
    }
  })

  it('dit que les vignettes, le cache d’icônes et le trousseau restent locaux', () => {
    expect(privacy).toMatch(/vignettes\//)
    expect(privacy).toMatch(/icônes\//)
    expect(privacy).toMatch(/Trousseau du système/)
    expect(privacy).toMatch(/aucun serveur Vela/i)
  })
})

describe('site — promesses cohérentes avec l’aide', () => {
  const readme = readFileSync(join(root, 'README.md'), 'utf8')
  const aide = (texts.find((page) => page.file === 'aide/index.html') || texts[0]).html
  const all = texts.map((page) => page.html).join('\n')

  it('ne promet pas une connexion Google infaillible', () => {
    for (const text of [readme, aide]) {
      expect(text).toMatch(/Google peut[^.]{0,60}refuser/i)
      expect(text).toMatch(/navigateur système/i)
      expect(text).toMatch(/importer (une|votre) session depuis Chrome ou Safari/i)
    }
    expect(all).not.toMatch(/Connexion Google garantie/i)
  })

  it('dit que les extensions et la synchronisation ne sont pas prises en charge', () => {
    for (const text of [readme, aide]) {
      expect(text).toMatch(/extensions[^.]{0,40}(Chrome|du Chrome Web Store)/i)
      expect(text).toMatch(/(non |pas )prises? en charge/i)
      expect(text).toMatch(/synchronisation/i)
    }
  })

  it('explique macOS non signé et Windows SmartScreen', () => {
    expect(aide).toMatch(/notari/i)
    expect(aide).toMatch(/Gatekeeper/)
    expect(aide).toMatch(/Confidentialité et sécurité/)
    expect(aide).toMatch(/SmartScreen/)
    expect(aide).toMatch(/Exécuter quand même/)
  })

  it('ne reprend pas le vocabulaire anglais de l’application', () => {
    for (const page of texts) {
      expect(page.html, `${page.file} : « Browse »`).not.toMatch(/\bBrowse\b/)
      expect(page.html, `${page.file} : « Work »`).not.toMatch(/>\s*Work\s*</)
    }
  })

  it('ne renvoie pas le build universel à une version future', () => {
    expect(all).not.toMatch(/prochaine version/)
    expect(all).toMatch(/Apple silicon et Intel/)
  })
})
