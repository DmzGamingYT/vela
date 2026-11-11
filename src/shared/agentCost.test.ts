import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, defaultProviders } from './defaults'
import { estimateAgentCost, formatUsd } from './agentCost'
import type { Settings } from './types'

function apiSettings(provider: 'openai' | 'local' = 'openai'): Settings {
  const providers = defaultProviders()
  providers[provider] = { ...providers[provider], hasKey: true }
  return {
    ...DEFAULT_SETTINGS,
    agent: { ...DEFAULT_SETTINGS.agent, mode: 'api', provider, providers }
  }
}

describe('estimation du coût de l’agent', () => {
  it('ne facture rien en mode démo', () => {
    const estimate = estimateAgentCost(DEFAULT_SETTINGS, 'Résume cette page', 1)
    expect(estimate.free).toBe(true)
    expect(estimate.usd).toBe(0)
    expect(estimate.tokensIn).toBeGreaterThan(0)
  })

  it('estime un coût pour un modèle API', () => {
    const estimate = estimateAgentCost(apiSettings(), 'Résume cette page', 1)
    expect(estimate.free).toBe(false)
    expect(estimate.usd).not.toBeNull()
    expect(estimate.usd!).toBeGreaterThan(0)
  })

  it('ne facture rien pour un modèle local', () => {
    const estimate = estimateAgentCost(apiSettings('local'), 'Résume cette page', 1)
    expect(estimate.free).toBe(true)
    expect(estimate.usd).toBe(0)
  })

  it('affiche un prix lisible', () => {
    expect(formatUsd(0.002)).toContain('$')
  })
})
