// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  alwaysTranslateFor,
  initialTranslationStatus,
  reduceTranslation,
  setAlwaysTranslateFor,
  type TranslationStatus
} from './translation'

describe('machine à états de la traduction', () => {
  it('ne montre la pastille que si un moteur existe et que la langue diffère', () => {
    expect(initialTranslationStatus('en', 'fr', true)).toBe('proposed')
    expect(initialTranslationStatus('fr', 'fr', true)).toBe('hidden')
    expect(initialTranslationStatus('en', 'fr', false)).toBe('hidden')
    expect(initialTranslationStatus(null, 'fr', true)).toBe('hidden')
  })

  it('parcourt proposée → en cours → traduite', () => {
    expect(reduceTranslation('proposed', { type: 'translate' })).toBe('running')
    expect(reduceTranslation('running', { type: 'done' })).toBe('translated')
  })

  it('revient à proposée quand on annule ou qu’on montre l’original', () => {
    expect(reduceTranslation('running', { type: 'translate' })).toBe('proposed')
    expect(reduceTranslation('translated', { type: 'restore' })).toBe('proposed')
    expect(reduceTranslation('error', { type: 'restore' })).toBe('proposed')
  })

  it('passe par l’erreur et permet de réessayer', () => {
    expect(reduceTranslation('running', { type: 'fail' })).toBe('error')
    expect(reduceTranslation('error', { type: 'translate' })).toBe('running')
  })

  it('garde les cinq états stables sur un événement sans effet', () => {
    const states: TranslationStatus[] = ['hidden', 'proposed', 'running', 'translated', 'error']
    for (const state of states) expect(reduceTranslation(state, { type: 'hide' })).toBe('hidden')
  })
})

describe('préférence « Toujours traduire »', () => {
  it('se mémorise par langue source', () => {
    setAlwaysTranslateFor('en', true)
    expect(alwaysTranslateFor('en')).toBe(true)
    expect(alwaysTranslateFor('de')).toBe(false)
    setAlwaysTranslateFor('en', false)
    expect(alwaysTranslateFor('en')).toBe(false)
  })
})
