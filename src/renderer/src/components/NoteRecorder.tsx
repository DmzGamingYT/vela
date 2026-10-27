import { useEffect, useRef, useState } from 'react'
import {
  MAX_RECORDING_BYTES,
  describeMicError,
  formatDuration,
  pickAudioMime,
  recorderStatus,
  type MicProblem
} from '@shared/recorder'
import { audioToken } from '@shared/noteLinks'
import { Icon } from './Icon'

/**
 * Enregistrement d'une note vocale.
 *
 * L'autorisation est expliquée avant l'appel au système : on dit ce qui sera
 * enregistré, où le fichier reste, et ce qui se passe en cas de refus. Le
 * fichier n'est écrit qu'à l'arrêt, dans le dossier de l'espace.
 */
export default function NoteRecorder({
  spaceId,
  onInsert,
  onClose,
  onError
}: {
  spaceId: string
  onInsert: (token: string) => void
  onClose: () => void
  onError?: (message: string) => void
}) {
  const [stage, setStage] = useState<'intro' | 'recording' | 'paused' | 'saving'>('intro')
  const [seconds, setSeconds] = useState(0)
  const [problem, setProblem] = useState<MicProblem | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const chunks = useRef<Blob[]>([])
  const ticker = useRef<number | null>(null)
  const startedAt = useRef(0)
  const pausedAt = useRef(0)
  const elapsed = useRef(0)

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
      stopTicker()
      try {
        if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop()
      } catch {
        /* déjà arrêté */
      }
      releaseStream()
    }
  }, [])

  const start = async (): Promise<void> => {
    setProblem(null)
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setProblem({
        reason: 'unsupported',
        message: 'Ce système ne permet pas d’enregistrer l’audio dans Vela.',
        system: false
      })
      return
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true }
      })
    } catch (error) {
      const described = describeMicError(error)
      setProblem(described)
      onError?.(described.message)
      return
    }

    const mime = pickAudioMime((type) => MediaRecorder.isTypeSupported(type))
    let next: MediaRecorder
    try {
      next = mime ? new MediaRecorder(stream.current, { mimeType: mime }) : new MediaRecorder(stream.current)
    } catch {
      releaseStream()
      setProblem({ reason: 'unsupported', message: 'Ce micro ne peut pas être enregistré par Vela.', system: false })
      return
    }

    chunks.current = []
    next.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.current.push(event.data)
    }
    next.onstop = () => void finish(next.mimeType || mime || 'audio/webm')
    recorder.current = next
    startedAt.current = Date.now()
    pausedAt.current = 0
    elapsed.current = 0
    setSeconds(0)
    next.start(1000)
    setStage('recording')
    stopTicker()
    ticker.current = window.setInterval(() => {
      if (pausedAt.current) return
      const total = elapsed.current + (Date.now() - startedAt.current) / 1000
      setSeconds(total)
    }, 250)
  }

  const pause = (): void => {
    const active = recorder.current
    if (!active || active.state !== 'recording') return
    active.pause()
    pausedAt.current = Date.now()
    elapsed.current += (pausedAt.current - startedAt.current) / 1000
    setSeconds(elapsed.current)
    setStage('paused')
  }

  const resume = (): void => {
    const active = recorder.current
    if (!active || active.state !== 'paused') return
    active.resume()
    startedAt.current = Date.now()
    pausedAt.current = 0
    setStage('recording')
  }

  const stop = (): void => {
    const active = recorder.current
    if (!active || active.state === 'inactive') return
    stopTicker()
    if (!pausedAt.current) elapsed.current += (Date.now() - startedAt.current) / 1000
    setSeconds(elapsed.current)
    setStage('saving')
    active.stop()
  }

  const finish = async (mime: string): Promise<void> => {
    releaseStream()
    const type = mime.split(';')[0] || 'audio/webm'
    const blob = new Blob(chunks.current, { type })
    chunks.current = []
    if (blob.size === 0) {
      setStage('intro')
      setProblem({ reason: 'unknown', message: 'Rien n’a été enregistré.', system: false })
      return
    }
    if (blob.size > MAX_RECORDING_BYTES) {
      setStage('intro')
      setProblem({
        reason: 'unknown',
        message: 'Cet enregistrement dépasse 25 Mo. Enregistrez un passage plus court.',
        system: false
      })
      return
    }
    const dataUrl = await new Promise<string | null>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
    if (!dataUrl) {
      setStage('intro')
      setProblem({ reason: 'unknown', message: 'L’enregistrement n’a pas pu être lu.', system: false })
      return
    }
    try {
      const saved = await window.vela.notes.audio.save({ spaceId, dataUrl })
      if (!saved) throw new Error('écriture refusée')
      onInsert(audioToken(saved.name, elapsed.current))
      onClose()
    } catch {
      setStage('intro')
      setProblem({
        reason: 'unknown',
        message: 'L’enregistrement n’a pas pu être écrit dans le dossier de l’espace.',
        system: false
      })
    }
  }

  const close = (): void => {
    if (stage === 'recording' || stage === 'paused') return
    releaseStream()
    onClose()
  }

  return (
    <div className="note-recorder" role="dialog" aria-modal="true" aria-label="Note vocale">
      <div className="note-recorder-card">
        <header>
          <span className="note-recorder-mark" aria-hidden="true">
            <Icon name="mic" size={15} />
          </span>
          <strong>Note vocale</strong>
          <button
            type="button"
            className="icon-btn"
            onClick={close}
            disabled={stage === 'recording' || stage === 'paused'}
            aria-label="Fermer l’enregistreur"
            title={stage === 'recording' ? 'Arrêtez l’enregistrement d’abord' : 'Fermer'}
          >
            <Icon name="close" size={15} />
          </button>
        </header>

        <p className="note-recorder-status" role="status" aria-live="polite">
          {recorderStatus(problem ? 'error' : stage)}
          {stage !== 'intro' && ` · ${formatDuration(seconds)}`}
        </p>

        {stage === 'intro' && (
          <div className="note-recorder-intro">
            <p>
              Le micro ne s’ouvre qu’après votre accord, et seulement pendant l’enregistrement. macOS affichera
              ensuite sa propre demande d’autorisation.
            </p>
            <p className="note-recorder-hint">
              <Icon name="lock" size={12} /> L’audio est écrit dans le dossier de l’espace, sur cet appareil. Rien
              n’est envoyé tant que vous ne demandez pas la transcription.
            </p>
            {problem && (
              <p className="note-recorder-problem" role="alert">
                <Icon name="warning" size={13} />
                {problem.message}
              </p>
            )}
            <div className="note-recorder-actions">
              <button type="button" className="action" onClick={onClose}>
                Annuler
              </button>
              <button type="button" className="action primary" onClick={() => void start()}>
                <Icon name="mic" size={13} /> Autoriser et enregistrer
              </button>
            </div>
          </div>
        )}

        {(stage === 'recording' || stage === 'paused') && (
          <div className="note-recorder-live">
            <span className="note-recorder-dot" data-paused={stage === 'paused'} aria-hidden="true" />
            <span className="note-recorder-time">{formatDuration(seconds)}</span>
            <div className="note-recorder-actions">
              <button type="button" className="action" onClick={() => (stage === 'paused' ? resume() : pause())}>
                <Icon name={stage === 'paused' ? 'play' : 'pause'} size={13} />
                {stage === 'paused' ? 'Reprendre' : 'Pause'}
              </button>
              <button type="button" className="action primary" onClick={stop}>
                <Icon name="check" size={13} /> Arrêter et insérer
              </button>
            </div>
          </div>
        )}

        {stage === 'saving' && (
          <p className="note-recorder-saving">
            <Icon name="download" size={13} /> Écriture de l’enregistrement…
          </p>
        )}
      </div>
    </div>
  )
}
