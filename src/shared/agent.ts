import type { AgentSource } from './types'
import { hostOf } from './url'

export interface DemoPlan {
  title: string
  steps: string[]
  markdown: string
}

const COMPARE = /\b(compar\w*|versus|vs\.?|différen\w*|oppos\w*|face[- ]à[- ]face)\b/i
const SUMMARIZE = /\b(résum\w*|synthès\w*|synthese|retiens|essentiel|lire)\b/i
const DECIDE = /\b(choisir|choix|décid\w*|recommand\w*|quel|quelle)\b/i

const ANGLES = [
  'Point d’entrée',
  'Contexte',
  'Détail opérationnel',
  'Contrepoint',
  'Approfondissement',
  'Exemple concret'
]

function cleanTitle(title: string): string {
  return title.replace(/\s*[-–|·]\s*[^-–|·]{0,40}$/, '').trim() || title
}

function titleFor(prompt: string, comparing: boolean): string {
  const short = prompt.replace(/\s+/g, ' ').trim()
  if (!short) return comparing ? 'Comparaison des onglets' : 'Synthèse des onglets'
  const words = short.split(' ').slice(0, 9).join(' ')
  const label = words.charAt(0).toUpperCase() + words.slice(1)
  return label.length > 58 ? `${label.slice(0, 57)}…` : label
}

function sourceLine(source: AgentSource): string {
  const host = hostOf(source.url)
  return `- **${cleanTitle(source.title) || host || 'Page'}** · ${host || 'source locale'}`
}

/**
 * Rapport simulé, calculé localement à partir du prompt et des titres/URL des onglets.
 * Aucun contenu de page n'est lu ni envoyé : le mode démo est explicite dans le rapport.
 */
export function planDemoRun(prompt: string, sources: AgentSource[]): DemoPlan {
  const question = prompt.replace(/\s+/g, ' ').trim()
  const comparing = COMPARE.test(question)
  const list = sources.length > 0 ? sources : [{ title: 'Aucun onglet joint', url: '' }]
  const usable = sources.length > 0
  const title = titleFor(question, comparing)

  const steps = comparing
    ? [
        `Lire ${list.length} onglet${list.length > 1 ? 's' : ''}`,
        'Extraire les angles de chaque source',
        'Construire le tableau comparatif',
        'Rédiger la synthèse et les prochaines étapes'
      ]
    : [
        `Lire ${list.length} onglet${list.length > 1 ? 's' : ''}`,
        'Dégager les points communs',
        'Rédiger la synthèse',
        'Proposer la suite'
      ]

  const lines: string[] = []
  lines.push('> **Mode démo** — rapport simulé localement à partir de vos titres et adresses.')
  lines.push('')
  lines.push('## Ce que j’ai lu')
  lines.push('')
  for (const source of list) lines.push(sourceLine(source))
  lines.push('')

  if (comparing) {
    lines.push('## Comparaison')
    lines.push('')
    lines.push('| Source | Angle | À retenir |')
    lines.push('| --- | --- | --- |')
    list.forEach((source, index) => {
      const name = cleanTitle(source.title) || hostOf(source.url) || `Source ${index + 1}`
      lines.push(
        `| ${name.replace(/\|/g, '/')} | ${ANGLES[index % ANGLES.length]} | ${
          index === 0 ? 'Référence principale à confronter' : 'Complète ou nuance la première lecture'
        } |`
      )
    })
    lines.push('')
    lines.push('## Lecture croisée')
    lines.push('')
    lines.push(
      `Les ${list.length} sources ouvertes ne répondent pas au même niveau : ${
        usable ? 'elles se complètent plus qu’elles ne se contredisent' : 'il manque des pages à joindre'
      }. La première pose le cadre, les suivantes apportent le détail ou le contrepoint.`
    )
  } else {
    lines.push('## L’essentiel')
    lines.push('')
    lines.push(
      usable
        ? `Votre question — « ${question || 'synthétiser ces pages'} » — se traite en croisant ${list.length} onglet${
            list.length > 1 ? 's' : ''
          }. Le fil commun : ${list
            .slice(0, 3)
            .map((source) => cleanTitle(source.title) || hostOf(source.url))
            .join(' · ')}.`
        : `« ${question || 'Synthétiser'} » : joignez au moins un onglet ouvert pour donner du contexte au rapport.`
    )
    lines.push('')
    lines.push('## Points clés')
    lines.push('')
    const points = [
      `La source « ${cleanTitle(list[0].title) || 'principale'} » sert de point d’entrée : elle fixe le vocabulaire et le cadre.`,
      list[1]
        ? `« ${cleanTitle(list[1].title)} » apporte le contexte manquant et permet de vérifier la première lecture.`
        : 'Une deuxième source rendrait la synthèse nettement plus solide.',
      list[2]
        ? `« ${cleanTitle(list[2].title)} » ajoute un détail opérationnel : c’est là que se jouent les décisions.`
        : 'Pensez à joindre la page qui contient les chiffres ou les contraintes réelles.'
    ]
    for (const point of points) lines.push(`- ${point}`)
  }

  lines.push('')
  lines.push('## Prochaines étapes')
  lines.push('')
  lines.push(
    DECIDE.test(question)
      ? '1. Trancher avec un critère explicite : impact, effort, reversibilité.\n2. Vérifier l’hypothèse la plus fragile dans la source d’origine.\n3. Consigner la décision dans une note Vela.'
      : SUMMARIZE.test(question)
        ? '1. Parcourir les passages surlignés dans chaque source.\n2. Fusionner les doublons, garder les nuances.\n3. Enregistrer ce rapport en note et le partager.'
        : '1. Ouvrir la source la plus dense en vue scindée.\n2. Noter les deux ou trois points à retenir.\n3. Relancer l’agent avec une question plus précise.'
  )
  lines.push('')
  lines.push('_Rapport de démonstration : branchez un modèle compatible OpenAI dans Réglages pour une lecture réelle des pages._')

  return { title, steps, markdown: lines.join('\n') }
}

export const AGENT_EXAMPLES = [
  'Compare les onglets ouverts et dis-moi lequel garder',
  'Fais le brief de ce que je dois retenir aujourd’hui',
  'Transforme ces pages en plan d’action en trois étapes',
  'Résume les sources jointes pour un collègue pressé'
]
