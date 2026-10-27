import { describe, expect, it } from 'vitest'
import { MAX_RECORDING_BYTES, describeMicError, formatDuration, pickAudioMime, recorderStatus } from './recorder'

describe('permission du micro', () => {
  it('explique un refus sans lever d’erreur', () => {
    const problem = describeMicError(Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' }))
    expect(problem.reason).toBe('denied')
    expect(problem.system).toBe(true)
    expect(problem.message).toContain('Réglages Système')
    expect(problem.message).not.toMatch(/error|undefined/i)
  })

  it('distingue un micro absent d’un micro occupé', () => {
    expect(describeMicError({ name: 'NotFoundError' }).reason).toBe('missing')
    expect(describeMicError({ name: 'NotReadableError' }).reason).toBe('busy')
    expect(describeMicError({ name: 'OverconstrainedError' }).reason).toBe('missing')
  })

  it('retombe sur un message neutre pour une erreur inconnue', () => {
    const problem = describeMicError(new Error('boum'))
    expect(problem.reason).toBe('unknown')
    expect(problem.message).toBe('Le micro n’a pas pu être ouvert. Rien n’a été enregistré.')
  })
})

describe('format de l’enregistrement', () => {
  it('affiche une durée lisible', () => {
    expect(formatDuration(7)).toBe('0:07')
    expect(formatDuration(72)).toBe('1:12')
    expect(formatDuration(3723)).toBe('1:02:03')
    expect(formatDuration(-4)).toBe('0:00')
  })

  it('choisit le premier type accepté par le moteur', () => {
    expect(pickAudioMime((mime) => mime.startsWith('audio/webm'))).toBe('audio/webm;codecs=opus')
    expect(pickAudioMime((mime) => mime === 'audio/mp4')).toBe('audio/mp4')
    expect(pickAudioMime(() => false)).toBe('')
    expect(
      pickAudioMime((mime) => {
        if (mime === 'audio/webm;codecs=opus') throw new Error('inconnu')
        return mime === 'audio/webm'
      })
    ).toBe('audio/webm')
  })

  it('borne la taille et décrit chaque état', () => {
    expect(MAX_RECORDING_BYTES).toBe(25 * 1024 * 1024)
    expect(recorderStatus('recording')).toBe('Enregistrement en cours')
    expect(recorderStatus('paused')).toBe('Enregistrement en pause')
    expect(recorderStatus('saving')).toContain('écriture')
  })
})
