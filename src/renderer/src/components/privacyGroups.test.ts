import { describe, expect, it } from 'vitest'
import { NETWORK_FLOWS } from '@shared/network'
import { FLOW_GROUPS, groupedFlows } from './privacyGroups'

/**
 * Garde-fou de présentation : le regroupement des flux ne doit jamais
 * masquer une destination de l'audit. Le tableau de la page Confidentialité
 * lit la même source que le test réseau ; ce test vérifie que la mise en
 * forme ne perd rien en route.
 */
describe('regroupement des flux réseau', () => {
  it('affiche chaque flux exactement une fois', () => {
    const shown = groupedFlows().flatMap((group) => group.flows.map((flow) => flow.id))
    expect(shown.sort()).toEqual(NETWORK_FLOWS.map((flow) => flow.id).sort())
    expect(new Set(shown).size).toBe(shown.length)
  })

  it('couvre toutes les catégories du réseau', () => {
    const covered = new Set(FLOW_GROUPS.flatMap((group) => group.categories))
    const categories = new Set(NETWORK_FLOWS.map((flow) => flow.category))
    expect([...categories].filter((category) => !covered.has(category))).toEqual([])
  })

  it('garde, dans chaque groupe, l’ordre de la source d’audit', () => {
    const grouped = groupedFlows()
    for (const group of grouped) {
      const sourceOrder = NETWORK_FLOWS.filter((flow) =>
        group.flows.some((item) => item.id === flow.id)
      ).map((flow) => flow.id)
      expect(group.flows.map((flow) => flow.id)).toEqual(sourceOrder)
    }
    expect(grouped.map((group) => group.label)).toEqual([
      'Recherche et navigation',
      'Accueil',
      'Tunnel de recherche',
      'Agent',
      'Mises à jour',
      'Icônes et pages'
    ])
  })
})
