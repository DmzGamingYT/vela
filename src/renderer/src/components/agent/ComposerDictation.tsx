import { useEffect, useRef, useState, type RefObject } from 'react'
import {
  MAX_RECORDING_BYTES,
  describeMicError,
  formatDuration,
  pickAudioMime
} from '@shared/recorder'
import { Icon } from '../Icon'

type Phase = 'closed' | 'consent' | 'recording' | 'transcribing' | 'error'

/**
 * Dictée du composeur : le micro ne s’ouvre qu’après un accord explicite, et
 * l’enregistrement n’est gardé que le temps de sa transcription.
 *
 * Le fichier audio suit le même chemin que dans Notes : il est écrit dans
 * l’espace, transcrit par le modèle configuré, puis supprimé. Un refus du
 * micro ou une transcription impossible laisse le texte déjà saisi intact.
 */
export default function ComposerDictation({
  spaceId,
  onText,
  onError,
  inputRef
}: {
  spaceId: string
  onText: (text: string) => void
  onError: (message: string) => void
  inputRef: RefObject<HTMLTextAreaElement | null>
}) {
  const [phase, setPhase] = useState<Phase>('closed')
  const [seconds, setSeconds] = useState(0)
  const [message, setMessage] = useState('')
  const recorder = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const chunks = useRef<Blob[]>([])
  const ticker = useRef<number | null>(null)
  const startedAt = useRef(0)
  const discarded = useRef(false)

  const stopTicker = (): void => {
    if (ticker.current !== null) {
      window.clearInterval(ticker.current)
      ticker.current = null
    }
  }

  const releaseStream = (): void => {
    stream.current?.getTracks().forEach((track) => track.stop())
    stream.current = null
  }

  useEffect(() => {
    return () => {
      discarded.current = true
      stopTicker()
      try {
        if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop()
      } catch {
        /* déjà arrêté */
      }
      releaseStream()
    }
  }, [])

  const reset = (): void => {
    stopTicker()
    releaseStream()
    recorder.current = null
    chunks.current = []
    setSeconds(0)
    setPhase('closed')
  }

  const fail = (text: string): void => {
    setMessage(text)
    setPhase('error')
    onError(text)
  }

  const finish = async (mime: string): Promise<void> => {
    releaseStream()
    if (discarded.current) return
    const type = mime.split(';')[0] || 'audio/webm'
    const blob = new Blob(chunks.current, { type })
    chunks.current = []
    if (blob.size === 0) {
      fail('Rien n’a été enregistré.')
      return
    }
    if (blob.size > MAX_RECORDING_BYTES) {
      fail('Cet enregistrement dépasse 25 Mo. Dictez un passage plus court.')
      return
    }
    const dataUrl = await new Promise<string | null>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
    if (!dataUrl) {
      fail('L’enregistrement n’a pas pu être lu.')
      return
    }
    setPhase('transcribing')
    let savedName = ''
    try {
      const saved = await window.vela.notes.audio.save({ spaceId, dataUrl })
      if (!saved) throw new Error('écriture refusée')
      savedName = saved.name
      const result = await window.vela.notes.transcribe({ name: saved.name, consent: true })
      if (!result.ok || !result.text) {
        fail(result.detail ?? 'La transcription n’a pas abouti.')
        return
      }
      onText(result.text.trim())
      setPhase('closed')
      setMessage('')
      inputRef.current?.focus()
    } catch {
      fail('L’enregistrement n’a pas pu être transcrit.')
    } finally {
      if (savedName) {
        void window.vela.notes.audio.remove(savedName).catch(() => undefined)
      }
    }
  }

  const start = async (): Promise<void> => {
    setMessage('')
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      fail('Ce système ne permet pas d’enregistrer l’audio dans Vela.')
      return
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true }
      })
    } catch (error) {
      fail(describeMicError(error).message)
      return
    }

    const mime = pickAudioMime((type) => MediaRecorder.isTypeSupported(type))
    let next: MediaRecorder
    try {
      next = mime
        ? new MediaRecorder(stream.current, { mimeType: mime })
        : new MediaRecorder(stream.current)
    } catch {
      releaseStream()
      fail('Ce micro ne peut pas être enregistré par Vela.')
      return
    }

    discarded.current = false
    chunks.current = []
    next.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.current.push(event.data)
    }
    next.onstop = () => void finish(next.mimeType || mime || 'audio/webm')
    recorder.current = next
    startedAt.current = Date.now()
    setSeconds(0)
    next.start(1000)
    setPhase('recording')
    stopTicker()
    ticker.current = window.setInterval(() => {
      setSeconds((Date.now() - startedAt.current) / 1000)
    }, 250)
  }

  const stop = (): void => {
    const active = recorder.current
    if (!active || active.state === 'inactive') return
    stopTicker()
    active.stop()
  }

  const discard = (): void => {
    discarded.current = true
    stopTicker()
    try {
      if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop()
    } catch {
      /* déjà arrêté */
    }
    reset()
  }

  const close = (): void => {
    if (phase === 'recording') {
      discard()
      return
    }
    reset()
  }

  return (
    <>
      <button
        type="button"
        className="composer-mic"
        data-recording={phase === 'recording'}
        disabled={!spaceId}
        aria-expanded={phase !== 'closed'}
        aria-label="Dicter une demande"
        title="Dicter — l’audio est transcrit par le modèle choisi"
        onClick={() => {
          if (phase === 'recording') stop()
          else setPhase('consent')
        }}
      >
        <Icon name="mic" size={13} />
      </button>

      {phase !== 'closed' && (
        <div className="mic-pop" role="dialog" aria-label="Dictée">
          <header className="mic-pop-head">
            <span className="mic-pop-mark" aria-hidden="true">
              <Icon name="mic" size={13} />
            </span>
            <strong>Dicter</strong>
            <button
              type="button"
              className="icon-btn"
              onClick={close}
              aria-label="Fermer la dictée"
              title="Fermer"
            >
              <Icon name="close" size={14} />
            </button>
          </header>

          {phase === 'consent' && (
            <>
              <p>
                Le micro ne s’ouvre qu’après votre accord. L’enregistrement est envoyé au modèle
                choisi pour être transcrit, puis supprimé du profil.
              </p>
              <div className="mic-pop-actions">
                <button type="button" className="action" onClick={reset}>
                  Annuler
                </button>
                <button type="button" className="action primary" onClick={() => void start()}>
                  <Icon name="mic" size={12} />
                  Autoriser et dicter
                </button>
              </div>
            </>
          )}

          {phase === 'recording' && (
            <>
              <div className="mic-pop-live">
                <span className="note-recorder-dot" aria-hidden="true" />
                <span className="mic-pop-time">{formatDuration(seconds)}</span>
                <span>Enregistrement…</span>
              </div>
              <div className="mic-pop-actions">
                <button type="button" className="action" onClick={discard}>
                  Annuler
                </button>
                <button type="button" className="action primary" onClick={stop}>
                  <Icon name="check" size={12} />
                  Arrêter et transcrire
                </button>
              </div>
            </>
          )}

          {phase === 'transcribing' && (
            <p className="mic-pop-status" role="status">
              <Icon name="upload" size={12} />
              Transcription en cours…
            </p>
          )}

          {phase === 'error' && (
            <>
              <p className="mic-pop-error" role="alert">
                <Icon name="warning" size={12} />
                {message}
              </p>
              <div className="mic-pop-actions">
                <button type="button" className="action" onClick={reset}>
                  Fermer
                </button>
                <button type="button" className="action primary" onClick={() => void start()}>
                  Réessayer
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  )
}
