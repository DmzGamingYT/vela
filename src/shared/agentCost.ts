import type { ProviderId, Settings } from './types'
import { isLoopbackEndpoint, providerById, providerReady, providerState } from './providers'

export interface AgentCostEstimate {
  /** Coût estimé en dollars US ; `null` si le tarif du modèle est inconnu. */
  usd: number | null
  /** Jetons d'entrée estimés (demande + pages + consigne système). */
  tokensIn: number
  /** Jetons de sortie estimés. */
  tokensOut: number
  known: boolean
  free: boolean
  detail: string
}

interface Price {
  input: number
  output: number
}

/**
 * Tarifs publics indicatifs, en dollars US par million de jetons.
 *
 * Ils servent uniquement à donner un ordre de grandeur avant l'envoi : le
 * fournisseur reste la seule source de vérité pour la facture. Les modèles
 * locaux et la démo ne facturent rien.
 */
const PRICES: { match: RegExp; input: number; output: number }[] = [
  { match: /gpt-4o-mini|openai\/gpt-4o-mini/i, input: 0.15, output: 0.6 },
  { match: /gpt-4o(?!-mini)/i, input: 2.5, output: 10 },
  { match: /claude-sonnet-4/i, input: 3, output: 15 },
  { match: /claude-haiku/i, input: 0.8, output: 4 },
  { match: /gemini-2\.5-flash/i, input: 0.3, output: 2.5 },
  { match: /gemini-2\.5-pro/i, input: 1.25, output: 10 },
  { match: /grok-4/i, input: 3, output: 15 },
  { match: /mistral-large/i, input: 2, output: 6 },
  { match: /deepseek-chat/i, input: 0.27, output: 1.1 },
  { match: /llama-3\.3-70b-versatile/i, input: 0.59, output: 0.79 },
  { match: /llama-3\.3-70b/i, input: 0.85, output: 1.2 }
]

/** Repli quand le modèle personnalisé n'est pas reconnu : tarif du fournisseur. */
const FALLBACK: Partial<Record<ProviderId, Price>> = {
  openai: { input: 0.15, output: 0.6 },
  anthropic: { input: 3, output: 15 },
  google: { input: 0.3, output: 2.5 },
  xai: { input: 3, output: 15 },
  mistral: { input: 2, output: 6 },
  deepseek: { input: 0.27, output: 1.1 },
  groq: { input: 0.59, output: 0.79 },
  cerebras: { input: 0.85, output: 1.2 },
  openrouter: { input: 0.15, output: 0.6 }
}

/** Contexte moyen estimé pour une page lue par l'agent. */
const PAGE_TOKENS = 900
const SYSTEM_TOKENS = 450

export function estimateAgentCost(
  settings: Settings,
  prompt: string,
  pages: number,
  mode: 'answer' | 'act' = 'answer'
): AgentCostEstimate {
  const tokensIn =
    Math.max(1, Math.round(prompt.trim().length / 4)) +
    Math.max(0, pages) * PAGE_TOKENS +
    SYSTEM_TOKENS
  const tokensOut = mode === 'act' ? 1200 : 800
  const definition = providerById(settings.agent.provider)
  const state = providerState(settings)

  if (!providerReady(settings)) {
    return {
      usd: 0,
      tokensIn,
      tokensOut,
      known: true,
      free: true,
      detail: 'Démo locale : aucun appel de modèle.'
    }
  }
  if (isLoopbackEndpoint(state.baseUrl)) {
    return {
      usd: 0,
      tokensIn,
      tokensOut,
      known: true,
      free: true,
      detail: 'Modèle local : aucun coût d’API.'
    }
  }

  const model = state.model.trim() || definition.model
  const price = PRICES.find((entry) => entry.match.test(model)) ?? FALLBACK[settings.agent.provider]
  if (!price) {
    return {
      usd: null,
      tokensIn,
      tokensOut,
      known: false,
      free: false,
      detail: 'Tarif inconnu pour ce modèle.'
    }
  }

  const usd = (tokensIn / 1_000_000) * price.input + (tokensOut / 1_000_000) * price.output
  return {
    usd,
    tokensIn,
    tokensOut,
    known: true,
    free: false,
    detail: `≈ ${tokensIn} jetons d’entrée et ${tokensOut} de sortie · tarifs publics indicatifs.`
  }
}

/** Prix lisible en français, avec le symbole dollar. */
export function formatUsd(value: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4
  }).format(value)
}
