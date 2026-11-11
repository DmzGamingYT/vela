import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { appearanceTokens, parseHex, THEME_PRESETS } from '@shared/theme'

/**
 * Garde-fou de la refonte : l'accent désigne, il ne teint pas.
 *
 * jsdom n'applique pas les feuilles et ne résout pas `var()` : un test de
 * rendu ne pourrait pas lire la couleur composée. On relit donc les sources —
 * les déclarations de fond des trois surfaces (rail, accueil, feuille de
 * réglages) — et on vérifie séparément les jetons calculés par
 * `appearanceTokens`, qui sont la seule porte par laquelle l'accent pourrait
 * revenir dans `--surface`.
 */

const STYLES = join(process.cwd(), 'src', 'renderer', 'src', 'styles')

type Rule = { selector: string; body: string }

function rules(css: string): Rule[] {
  const out: Rule[] = []
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const walk = (text: string): void => {
    let index = 0
    while (index < text.length) {
      const open = text.indexOf('{', index)
      if (open === -1) break
      const selector = text.slice(index, open).trim()
      let depth = 0
      let close = open
      for (; close < text.length; close += 1) {
        if (text[close] === '{') depth += 1
        else if (text[close] === '}') {
          depth -= 1
          if (depth === 0) break
        }
      }
      const body = text.slice(open + 1, close)
      if (selector.startsWith('@')) walk(body)
      else out.push({ selector, body })
      index = close + 1
    }
  }
  walk(clean)
  return out
}

/** Les trois surfaces, plus les blocs qui vivent dessus. */
const SURFACES = [
  { nom: 'rail', motifs: ['.rail', '.space-chip', '.space-avatar', '.rail-mode', '.rail-ghost'] },
  { nom: 'accueil', motifs: ['.home-card', '.home-field', '.home-foot', '.recent-empty', '.home-day'] },
  { nom: 'réglages', motifs: ['.settings-sheet', '.overview-card', '.settings-main', '.settings-nav'] },
  {
    nom: 'notes',
    motifs: [
      '.notes-drawer',
      '.notes-head',
      '.notes-title',
      '.notes-mark',
      '.notes-templates',
      '.notes-list',
      '.note-row',
      '.notes-editor'
    ]
  },
  {
    nom: 'agent',
    motifs: [
      '.agent-dock',
      '.agent-head',
      '.agent-panel',
      '.agent-msg',
      '.agent-bubble',
      '.agent-card',
      '.agent-compose'
    ]
  },
  {
    nom: 'palette ⌘K',
    motifs: [
      '.command',
      '.command-input-row',
      '.command-list',
      '.command-item',
      '.command-icon',
      '.command-space',
      '.command-foot'
    ]
  }
]

/** Toute teinte d'accent, directe ou par ses alias historiques. */
const TEINTE =
  /var\(--(accent|accent-a|accent-b|accent-c|accent-soft|glow|sky-[123]|clay|indigo|tint)\b/

// Le filet compte : c'est une bordure de 35 % d'accent qui a survécu au premier
// passage sur le carré des notes, alors que son fond était déjà neutre.
const PEINTURE =
  /^(background|background-color|background-image|box-shadow|border|border-color|border-top|border-right|border-bottom|border-left)$/

const fichiers = readdirSync(STYLES)
  .filter((nom) => nom.endsWith('.css'))
  .sort()
const feuilles = fichiers.map((nom) => ({ nom, css: readFileSync(join(STYLES, nom), 'utf8') }))

/** Déclarations de peinture d'une règle, hors pseudo-éléments (barres d'indicateur). */
function peinture(rule: Rule): string[] {
  if (/::?(before|after)/.test(rule.selector)) return []
  return rule.body
    .split(';')
    .map((declaration) => declaration.trim())
    .filter((declaration) => PEINTURE.test(declaration.split(':')[0]?.trim() ?? ''))
    .map((declaration) => declaration.replace(/\s+/g, ' '))
}

describe('aucune surface ne reprend la teinte d’accent', () => {
  for (const { nom, motifs } of SURFACES) {
    it(`${nom} : les fonds et ombres restent au papier et aux neutres`, () => {
      const fautes: string[] = []
      for (const { nom: fichier, css } of feuilles) {
        for (const rule of rules(css)) {
          const selecteurs = rule.selector.split(',')
          const concerne = selecteurs.some((selecteur) =>
            motifs.some((motif) => new RegExp(`${motif.replace('.', '\\.')}(?![\\w-])`).test(selecteur))
          )
          if (!concerne) continue
          for (const declaration of peinture(rule)) {
            // Les états de focus et de survol peuvent peindre une bordure
            // d'accent ; ce qui est interdit, c'est un fond ou une ombre teintés.
            if (selecteurEstEtat(rule.selector)) continue
            if (TEINTE.test(declaration)) fautes.push(`${fichier} — ${rule.selector} { ${declaration} }`)
          }
        }
      }
      expect(fautes).toEqual([])
    })
  }

  it('le rail n’a qu’un repère coloré : les barres d’indicateur', () => {
    const barres = feuilles.flatMap(({ css }) =>
      rules(css).filter((rule) => /::?before/.test(rule.selector) && TEINTE.test(rule.body))
    )
    expect(barres.length).toBeGreaterThan(0)
  })
})

/**
 * Une règle d'état : survol, focus, ou sélection. La sélection a droit à
 * l'accent — c'est un indicateur, comme les barres des rails — mais elle ne
 * doit pas repeindre un fond permanent.
 */
function selecteurEstEtat(selector: string): boolean {
  return /:(hover|focus|focus-visible|active|checked|target)|\[data-active='true'\]|\[aria-selected='true'\]|\[aria-current/.test(
    selector
  )
}

describe('les jetons de surface restent du papier', () => {
  const rgb = (valeur: string): { r: number; g: number; b: number; a: number } | null => {
    const m = valeur.match(/rgba?\(([^)]+)\)/)
    if (!m) return null
    const [r, g, b, a] = m[1].split(',').map((part) => parseFloat(part))
    return { r, g, b, a: a === undefined ? 1 : a }
  }

  /** `--surface` composé sur `--paper`, la couleur réellement vue. */
  const compose = (tokens: Record<string, string>): { r: number; g: number; b: number } | null => {
    const surface = rgb(tokens['--surface'])
    const papier = parseHex(tokens['--paper'] ?? '')
    if (!surface || !papier) return null
    const fond = {
      r: parseInt(papier.slice(1, 3), 16),
      g: parseInt(papier.slice(3, 5), 16),
      b: parseInt(papier.slice(5, 7), 16)
    }
    return {
      r: surface.r * surface.a + fond.r * (1 - surface.a),
      g: surface.g * surface.a + fond.g * (1 - surface.a),
      b: surface.b * surface.a + fond.b * (1 - surface.a)
    }
  }

  const ecart = (
    a: { r: number; g: number; b: number },
    b: { r: number; g: number; b: number }
  ): number => Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b))

  for (const preset of THEME_PRESETS) {
    for (const mode of ['light', 'dark'] as const) {
      for (const glass of ['light', 'normal', 'strong'] as const) {
        it(`${preset.id} / ${mode} / verre ${glass} : le verre reste à moins de 14/255 du papier`, () => {
          const tokens = appearanceTokens({
            themeId: preset.id,
            customAccent: preset.light,
            mode,
            glass,
            highContrast: false
          })
          const papier = tokens['--paper']
          const hex = parseHex(papier) ?? '#000000'
          const fond = {
            r: parseInt(hex.slice(1, 3), 16),
            g: parseInt(hex.slice(3, 5), 16),
            b: parseInt(hex.slice(5, 7), 16)
          }
          const vu = compose(tokens)
          expect(vu).not.toBeNull()
          expect(ecart(vu!, fond)).toBeLessThanOrEqual(14)
        })
      }
    }
  }

  it('en contraste élevé, le verre est exactement le papier', () => {
    for (const preset of THEME_PRESETS) {
      for (const mode of ['light', 'dark'] as const) {
        const tokens = appearanceTokens({
          themeId: preset.id,
          customAccent: preset.light,
          mode,
          glass: 'normal',
          highContrast: true
        })
        const surface = rgb(tokens['--surface'])
        const hex = parseHex(tokens['--paper']) ?? '#000000'
        expect(surface?.a).toBe(1)
        expect(
          surface && [Math.round(surface.r), Math.round(surface.g), Math.round(surface.b)]
        ).toEqual([
          parseInt(hex.slice(1, 3), 16),
          parseInt(hex.slice(3, 5), 16),
          parseInt(hex.slice(5, 7), 16)
        ])
      }
    }
  })

  it('les nappes de l’accueil se peignent avec les teintes de papier, pas l’accent', () => {
    // Le lavis d'un thème peut partager sa valeur avec l'accent (rose, vert) :
    // ce qui compte est la source, pas la couleur finale.
    const nappes = feuilles.flatMap(({ css }) =>
      rules(css).filter(
        (rule) => /\.aurora-blob/.test(rule.selector) && /background/.test(rule.body)
      )
    )
    expect(nappes.length).toBeGreaterThan(0)
    for (const nappe of nappes) {
      expect(nappe.body).toMatch(/var\(--wash-[12]\)/)
      expect(nappe.body).not.toMatch(/var\(--accent/)
    }
  })
})
