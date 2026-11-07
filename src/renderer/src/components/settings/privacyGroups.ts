import { NETWORK_FLOWS, type NetworkFlow } from '@shared/network'

/**
 * Regroupement d'affichage des flux. Il ne filtre rien : chaque entrée de
 * NETWORK_FLOWS doit apparaître dans un groupe, et `privacyGroups.test.ts`
 * échoue si une catégorie n'est couverte par personne.
 */
export const FLOW_GROUPS: {
  id: string
  label: string
  categories: NetworkFlow['category'][]
}[] = [
  { id: 'navigation', label: 'Recherche et navigation', categories: ['recherche'] },
  { id: 'accueil', label: 'Accueil', categories: ['meteo', 'journal'] },
  { id: 'tunnel', label: 'Tunnel de recherche', categories: ['tunnel'] },
  { id: 'agent', label: 'Agent', categories: ['modeles'] },
  { id: 'maj', label: 'Mises à jour', categories: ['mises-a-jour'] },
  { id: 'icones', label: 'Icônes et pages', categories: ['pages', 'extensions'] }
]

export function groupedFlows(
  flows: readonly NetworkFlow[] = NETWORK_FLOWS
): { id: string; label: string; flows: NetworkFlow[] }[] {
  return FLOW_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    flows: flows.filter((flow) => group.categories.includes(flow.category))
  }))
}
