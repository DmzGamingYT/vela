import type { IconName } from '../Icon'

export interface AgentQuickAction {
  id: string
  label: string
  icon: IconName
  /** Ce que fait la demande, en une ligne. */
  hint: string
  /** Demande prête à envoyer : l'utilisateur peut la retoucher avant l'envoi. */
  prompt: string
}

/**
 * Les gestes simples de l'agent. Chacun n'est qu'une phrase posée dans le
 * composeur : rien n'est envoyé sans un clic sur « Envoyer », et les pages
 * jointes restent celles que l'on voit.
 */
export const AGENT_QUICK_ACTIONS: AgentQuickAction[] = [
  {
    id: 'summarize',
    label: 'Résumer',
    icon: 'list',
    hint: 'Cinq points clés, puis une synthèse de trois lignes',
    prompt:
      'Résume ces pages en cinq points clés, puis une synthèse de trois lignes. Garde les chiffres et les dates.'
  },
  {
    id: 'compare',
    label: 'Comparer',
    icon: 'split',
    hint: 'Points communs, différences et ce qu’il faut retenir',
    prompt:
      'Compare ces pages : points communs, différences et ce qu’il faut retenir. Cite les passages qui appuient chaque point.'
  },
  {
    id: 'translate',
    label: 'Traduire',
    icon: 'translate',
    hint: 'En français, structure et titres conservés',
    prompt: 'Traduis le contenu de ces pages en français, en gardant les titres et la structure.'
  },
  {
    id: 'explain',
    label: 'Expliquer',
    icon: 'sparkles',
    hint: 'Le sujet en clair, sans jargon',
    prompt:
      'Explique simplement ce que dit cette page, comme à quelqu’un qui découvre le sujet. Définis les termes techniques.'
  },
  {
    id: 'keypoints',
    label: 'Retenir',
    icon: 'check',
    hint: 'Décisions, chiffres et dates, avec leur contexte',
    prompt: 'Liste ce qu’il faut retenir : décisions, chiffres et dates, chacun avec son contexte.'
  },
  {
    id: 'plan',
    label: 'Planifier',
    icon: 'map',
    hint: 'Trois étapes concrètes, dans l’ordre',
    prompt: 'Transforme ces pages en plan d’action de trois étapes concrètes, dans l’ordre.'
  },
  {
    id: 'correct',
    label: 'Corriger',
    icon: 'edit',
    hint: 'Orthographe et grammaire, sens inchangé',
    prompt: 'Corrige l’orthographe et la grammaire du texte de cette page, sans changer le sens.'
  },
  {
    id: 'links',
    label: 'Extraire les liens',
    icon: 'link',
    hint: 'Toutes les adresses citées, avec leur texte',
    prompt:
      'Extrais tous les liens de ces pages : adresse, texte du lien et ce qu’il apporte. Garde l’ordre du document.'
  }
]
