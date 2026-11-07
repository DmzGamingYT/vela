import { describe, expect, it } from 'vitest'
import { historyContext, planDemoRun } from './agent'

const sources = [
  { title: 'Arc — a calmer internet', url: 'https://arc.net' },
  { title: 'Dia — the browser for work', url: 'https://www.diabrowser.com' }
]

describe('planDemoRun', () => {
  it('produit un titre, des étapes et un rapport', () => {
    const plan = planDemoRun('Résume ces pages pour un collègue', sources)
    expect(plan.title.length).toBeGreaterThan(0)
    expect(plan.steps).toHaveLength(4)
    expect(plan.markdown).toContain('Mode démo')
    expect(plan.markdown).toContain('arc.net')
    expect(plan.markdown).toContain('diabrowser.com')
    expect(plan.markdown).toContain('## Points clés')
  })

  it('bascule en comparaison quand le prompt le demande', () => {
    const plan = planDemoRun('Compare Arc et Dia', sources)
    expect(plan.markdown).toContain('| Source | Angle | À retenir |')
    expect(plan.steps.join(' ')).toContain('tableau comparatif')
  })

  it('reste utile sans source jointe', () => {
    const plan = planDemoRun('', [])
    expect(plan.markdown).toContain('Aucun onglet joint')
    expect(plan.markdown).not.toContain('undefined')
  })
})

describe('historyContext', () => {
  it('met les tours dans l’ordre, sans garder les vides', () => {
    const context = historyContext([
      { role: 'user', content: 'Première question' },
      { role: 'assistant', content: 'Première réponse' },
      { role: 'user', content: '   ' }
    ])
    expect(context).toContain('Utilisateur : Première question')
    expect(context).toContain('Vela : Première réponse')
    expect(context.trim().endsWith('Vela : Première réponse')).toBe(true)
  })

  it('garde les tours les plus récents et borne chaque texte', () => {
    const many = Array.from({ length: 12 }, (_, index) => ({
      role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
      content: `Tour ${index} ${'x'.repeat(5000)}`
    }))
    const context = historyContext(many, 4)
    expect(context).not.toContain('Tour 7 ')
    expect(context).toContain('Tour 11 ')
    expect(context.length).toBeLessThan(4 * 4100)
  })

  it('ne produit rien sans historique', () => {
    expect(historyContext(undefined)).toBe('')
    expect(historyContext([])).toBe('')
  })
})
