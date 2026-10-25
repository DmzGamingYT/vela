import { describe, expect, it } from 'vitest'
import { planDemoRun } from './agent'

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
