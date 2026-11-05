import { describe, expect, it } from 'vitest'
import {
  codeLabel,
  detectLanguage,
  langCode,
  languageName,
  needsTranslation
} from './language'

describe('langue des pages', () => {
  it('normalise les codes longs', () => {
    expect(langCode('en-US')).toBe('en')
    expect(langCode('PT_br')).toBe('pt')
    expect(langCode('')).toBeNull()
    expect(langCode('pas une langue')).toBeNull()
  })

  it('privilégie la langue déclarée par le document', () => {
    expect(detectLanguage('de', 'this is an english sentence with the and of')).toBe('de')
  })

  it('devine la langue sur le texte quand rien n’est déclaré', () => {
    const english =
      'The browser keeps the page with all of the notes that you write in the workspace and for the agent'
    const french =
      'Le navigateur garde la page avec toutes les notes que vous écrivez dans l’espace et pour l’agent'
    expect(detectLanguage('', english)).toBe('en')
    expect(detectLanguage(null, french)).toBe('fr')
  })

  it('renvoie null quand l’échantillon est trop court ou muet', () => {
    expect(detectLanguage(null, 'Bonjour')).toBeNull()
    expect(detectLanguage(undefined, '')).toBeNull()
  })

  it('nomme les langues pour les libellés', () => {
    expect(languageName('en')).toBe('anglais')
    expect(languageName('fr-FR')).toBe('français')
    expect(languageName('xx')).toBe('XX')
    expect(codeLabel('en-GB')).toBe('EN')
  })

  it('ne propose la traduction que pour une autre langue connue', () => {
    expect(needsTranslation('en', 'fr')).toBe(true)
    expect(needsTranslation('fr-CA', 'fr')).toBe(false)
    expect(needsTranslation(null, 'fr')).toBe(false)
    expect(needsTranslation('en', '')).toBe(false)
  })
})
