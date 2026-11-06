import { describe, expect, it } from 'vitest'
import { normalize, rankItems, scoreOf } from './commandRank'

interface Item {
  id: string
  group: string
  label: string
  hint?: string
  generated?: boolean
}

const note: Item = { id: 'note', group: 'Notes', label: 'Hébergement statique', hint: 'Notes de mise en ligne' }
const command: Item = { id: 'command', group: 'Actions', label: 'Gestionnaire de processus', hint: 'Hébergement des processus' }
const tab: Item = { id: 'tab', group: 'Onglets', label: 'Hébergement', hint: 'Espace travail · example.com' }

describe('scoreOf', () => {
  it('classe le titre exact avant tout le reste', () => {
    expect(scoreOf(tab, 'hebergement')).toBeGreaterThan(scoreOf(note, 'hebergement'))
    expect(scoreOf(note, 'hebergement')).toBeGreaterThan(scoreOf(command, 'hebergement'))
  })

  it('ignore les accents et la casse', () => {
    expect(normalize('Hébergement')).toBe('hebergement')
    expect(scoreOf(note, normalize('HÉBERGEMENT'))).toBeGreaterThan(scoreOf(command, 'hebergement'))
  })

  it('donne un bonus aux destinations plutôt qu’aux commandes', () => {
    const generic = { group: 'Actions', label: 'Ouvrir', hint: 'example' }
    const destination = { group: 'Onglets', label: 'Ouvrir', hint: 'example' }
    expect(scoreOf(destination, 'ouvrir')).toBeGreaterThan(scoreOf(generic, 'ouvrir'))
  })
})

describe('rankItems', () => {
  it('place la note qui porte le titre avant la commande qui ne le cite qu’en indice', () => {
    const ranked = rankItems([command, note, tab], 'hebergement')
    expect(ranked[0]?.id).toBe('tab')
    expect(ranked[1]?.id).toBe('note')
    expect(ranked[2]?.id).toBe('command')
  })

  it('garde les groupes contigus pour que les en-têtes ne se répètent pas', () => {
    const items: Item[] = [
      { id: 'a1', group: 'Actions', label: 'Nouvel onglet' },
      { id: 'n1', group: 'Notes', label: 'Nouvelle note' },
      { id: 'a2', group: 'Actions', label: 'Nouvelle fenêtre' },
      { id: 'n2', group: 'Notes', label: 'Nouvelle idée' }
    ]
    const groups = rankItems(items, 'nouvel').map((item) => item.group)
    // Les notes ont le bonus de destination : leur groupe passe devant, mais
    // chaque groupe reste d'un seul bloc.
    expect(groups).toEqual(['Notes', 'Notes', 'Actions', 'Actions'])
  })

  it('met l’action qui porte le mot devant la recherche fabriquée à partir de la frappe', () => {
    const search = {
      id: 'search',
      group: 'Aller',
      generated: true,
      label: 'Ouvrir « historique »',
      hint: 'Recherche'
    }
    const action = { id: 'history', group: 'Actions', label: 'Afficher l’historique', hint: '⌘Y' }
    expect(rankItems([search, action], 'historique')[0]?.id).toBe('history')
    // Une recherche reste le seul résultat quand rien d'autre ne correspond.
    const alone = { id: 'only', group: 'Aller', generated: true, label: 'Ouvrir « zzz »', hint: 'Recherche' }
    expect(rankItems([alone], 'zzz')[0]?.id).toBe('only')
  })

  it('écarte les résultats qui ne correspondent pas et conserve l’ordre sans recherche', () => {
    const items: Item[] = [
      { id: 'keep', group: 'Actions', label: 'Téléchargements' },
      { id: 'drop', group: 'Actions', label: 'Réglages' }
    ]
    expect(rankItems(items, 'telecharg').map((item) => item.id)).toEqual(['keep'])
    expect(rankItems(items, '').map((item) => item.id)).toEqual(['keep', 'drop'])
  })
})
