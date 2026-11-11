import type { IconName } from '../Icon'
import type { ComposerTab } from './ChatComposer'
import { AGENT_QUICK_ACTIONS, type AgentQuickAction } from './quickActions'

export type AgentPageKind = 'video' | 'article' | 'page'

export interface AgentSuggestion {
  id: string
  label: string
  prompt: string
  /** Un pictogramme propre à l’action, repris dans la liste. */
  icon: IconName
}

const VIDEO_HOSTS =
  /(^|\.)(youtube\.com|youtu\.be|vimeo\.com|dailymotion\.com|twitch\.tv|tiktok\.com)$/i
const VIDEO_PATH = /(^|\/)(watch|video|videos|reel|reels|shorts|embed)(\/|$)/i
const ARTICLE_PATH =
  /(^|\/)(article|articles|post|posts|blog|news|story|stories|docs?|documentation|wiki)(\/|$)/i

/** Type lisible d'une page, déduit de son adresse — sans lire son contenu. */
export function pageKindOf(tab?: ComposerTab): AgentPageKind | null {
  if (!tab) return null
  try {
    const url = new URL(tab.url)
    const host = url.hostname.replace(/^www\./i, '')
    if (VIDEO_HOSTS.test(host) || VIDEO_PATH.test(url.pathname)) return 'video'
    const hasPath = url.pathname.replace(/\/+$/, '').length > 0
    if (hasPath || ARTICLE_PATH.test(url.pathname)) return 'article'
    return 'page'
  } catch {
    return 'page'
  }
}

export function pageKindFor(tabs: ComposerTab[]): AgentPageKind | null {
  if (tabs.length === 0) return null
  if (tabs.length === 1) return pageKindOf(tabs[0])
  const kinds = tabs.map((tab) => pageKindOf(tab))
  if (kinds.every((kind) => kind === 'video')) return 'video'
  if (kinds.every((kind) => kind === 'article')) return 'article'
  return 'page'
}

function objectLabel(kind: AgentPageKind | null, count: number): string {
  if (count > 1) return kind === 'video' ? 'ces vidéos' : 'ces pages'
  if (kind === 'video') return 'cette vidéo'
  if (kind === 'article') return 'cet article'
  return 'cette page'
}

/**
 * Trois suggestions qui changent avec la sélection : une vidéo ne se résume
 * pas comme deux articles, et « ces pages » ne veut rien dire sans page.
 * Les libellés restent à l'infinitif pour se lire comme des actions.
 */
export function buildAgentSuggestions(
  tabs: ComposerTab[],
  mode: 'answer' | 'act'
): AgentSuggestion[] {
  const count = tabs.length
  const kind = pageKindFor(tabs)
  const label = objectLabel(kind, count)

  if (mode === 'act') {
    if (count === 0) {
      return [
        {
          id: 'act-search',
          label: 'Chercher une information',
          prompt: 'Cherche une information précise sur une page et dis-moi ce que tu trouves.',
          icon: 'search'
        },
        {
          id: 'act-open',
          label: 'Ouvrir la source principale',
          prompt: 'Ouvre la source principale de cette recherche et résume ce qu’elle contient.',
          icon: 'external'
        },
        {
          id: 'act-prepare',
          label: 'Préparer une réponse',
          prompt: 'Prépare une réponse à partir des informations que je vais te donner.',
          icon: 'edit'
        }
      ]
    }
    return [
      {
        id: 'act-search',
        label: 'Chercher une information',
        prompt: `Cherche une information précise dans ${label} et cite le passage exact.`,
        icon: 'search'
      },
      {
        id: 'act-open',
        label: 'Ouvrir la source citée',
        prompt: `Ouvre la source citée par ${label} et résume-la.`,
        icon: 'external'
      },
      {
        id: 'act-prepare',
        label: 'Préparer une réponse',
        prompt: `Prépare une réponse à partir de ${label}.`,
        icon: 'edit'
      }
    ]
  }

  if (count === 0) {
    return [
      {
        id: 'none-summary',
        label: 'Résumer une page',
        prompt: 'Résume la page que je vais joindre en cinq points clés.',
        icon: 'list'
      },
      {
        id: 'none-compare',
        label: 'Comparer deux pages',
        prompt: 'Compare les deux pages que je vais joindre et dis-moi ce qui les distingue.',
        icon: 'split'
      },
      {
        id: 'none-plan',
        label: 'Préparer un plan',
        prompt: 'Prépare un plan d’action en trois étapes à partir des pages que je vais joindre.',
        icon: 'map'
      }
    ]
  }

  if (count > 1) {
    const videos = kind === 'video'
    return [
      {
        id: 'multi-compare',
        label: videos ? 'Comparer ces vidéos' : 'Comparer ces pages',
        prompt: videos
          ? 'Compare ces vidéos : angles, sources et points communs.'
          : 'Compare ces pages : points communs, différences et ce qu’il faut retenir.',
        icon: 'split'
      },
      {
        id: 'multi-keep',
        label: 'Garder les points communs',
        prompt: videos
          ? 'Garde les idées communes à ces vidéos, avec les passages qui les portent.'
          : 'Garde les points communs à ces pages, avec les passages qui les portent.',
        icon: 'check'
      },
      {
        id: 'multi-summary',
        label: videos ? 'Résumer ces vidéos' : 'Résumer ces pages',
        prompt: videos
          ? 'Résume ces vidéos en une synthèse de trois lignes, puis les idées clés.'
          : 'Résume ces pages en une synthèse de trois lignes, puis les points clés.',
        icon: 'list'
      }
    ]
  }

  return [
    {
      id: 'one-summary',
      label: `Résumer ${label}`,
      prompt: `Résume ${label} en cinq points clés, puis une synthèse de trois lignes.`,
      icon: 'list'
    },
    {
      id: 'one-keep',
      label: 'Garder les points clés',
      prompt: `Garde les points clés de ${label}, avec les chiffres et les dates.`,
      icon: 'check'
    },
    {
      id: 'one-plan',
      label: 'Préparer un plan d’action',
      prompt: `Prépare un plan d’action de trois étapes concrètes à partir de ${label}.`,
      icon: 'map'
    }
  ]
}

const QUICK_COPY: Record<string, (label: string) => string> = {
  summarize: (label) =>
    `Résume ${label} en cinq points clés, puis une synthèse de trois lignes. Garde les chiffres et les dates.`,
  compare: (label) =>
    `Compare ${label} : points communs, différences et ce qu’il faut retenir. Cite les passages qui appuient chaque point.`,
  translate: (label) =>
    `Traduis le contenu de ${label} en français, en gardant les titres et la structure.`,
  explain: (label) =>
    `Explique simplement ce que dit ${label}, comme à quelqu’un qui découvre le sujet. Définis les termes techniques.`,
  keypoints: (label) =>
    `Liste ce qu’il faut retenir de ${label} : décisions, chiffres et dates, chacun avec son contexte.`,
  plan: (label) => `Transforme ${label} en plan d’action de trois étapes concrètes, dans l’ordre.`,
  correct: (label) =>
    `Corrige l’orthographe et la grammaire du texte de ${label}, sans changer le sens.`,
  links: (label) =>
    `Extrais tous les liens de ${label} : adresse, texte du lien et ce qu’il apporte. Garde l’ordre du document.`
}

/** Les six raccourcis, reformulés pour la sélection courante. */
export function buildQuickActions(tabs: ComposerTab[]): AgentQuickAction[] {
  const kind = pageKindFor(tabs)
  const label = objectLabel(kind, tabs.length)
  return AGENT_QUICK_ACTIONS.filter(
    (action) => !(kind === 'video' && action.id === 'correct')
  ).map((action) => {
    const copy = QUICK_COPY[action.id]?.(label)
    return copy ? { ...action, prompt: copy } : action
  })
}
