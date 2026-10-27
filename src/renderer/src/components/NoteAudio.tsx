import { useEffect, useState } from 'react'
import { Icon } from './Icon'

/**
 * Lecteur d'une note vocale venant du disque de l'espace.
 *
 * Le fichier n'est lu qu'à l'affichage de la note ; rien n'est envoyé. La
 * transcription n'envoie l'enregistrement qu'après un accord explicite, et le
 * dit clairement pendant l'envoi.
 */
export default function NoteAudio({
  name,
  label,
  onRemove,
  onTranscribe,
  onError
}: {
  name: string
  label?: string
  onRemove?: (name: string) => void
  onTranscribe?: (name: string, text: string) => void
  onError?: (message: string) => void
}) {
  const [src, setSrc] = useState<string | null | undefined>(undefined)
  const [stage, setStage] = useState<'idle' | 'consent' | 'busy' | 'message'>('idle')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState<'local' | 'cloud' | null>(null)

  useEffect(() => {
    let alive = true
    void window.vela.notes.audio
      .get(name)
      .then((value) => {
        if (alive) setSrc(value)
      })
      .catch(() => {
        if (alive) setSrc(null)
      })
    return () => {
      alive = false
    }
  }, [name])

  const remove = async (): Promise<void> => {
    try {
      await window.vela.notes.audio.remove(name)
    } catch {
      /* le fichier a déjà disparu */
    }
    onRemove?.(name)
  }

  const transcribe = async (consent: boolean): Promise<void> => {
    setStage('busy')
    setSending(consent ? 'cloud' : 'local')
    try {
      const result = await window.vela.notes.transcribe({ name, consent })
      if (result.ok && result.text) {
        setSending(result.mode === 'cloud' ? 'cloud' : 'local')
        onTranscribe?.(name, result.text)
        setStage('idle')
        return
      }
      if (result.reason === 'consent-required' && !consent) {
        setMessage(result.detail ?? '')
        setStage('consent')
        return
      }
      setMessage(result.detail ?? 'La transcription n’a pas abouti.')
      setStage('message')
      onError?.(result.detail ?? 'La transcription n’a pas abouti.')
    } catch {
      setMessage('La transcription n’a pas abouti.')
      setStage('message')
    } finally {
      setSending(null)
    }
  }

  if (src === undefined) {
    return (
      <span className="note-audio loading" role="status">
        Lecture de l’enregistrement…
      </span>
    )
  }

  if (src === null) {
    return (
      <span className="note-audio missing">
        <Icon name="warning" size={13} />
        <span>Enregistrement introuvable sur cet appareil</span>
        {onRemove && (
          <button type="button" className="text-btn" onClick={() => void remove()}>
            Retirer de la note
          </button>
        )}
      </span>
    )
  }

  return (
    <div className="note-audio">
      <div className="note-audio-row">
        <span className="note-audio-mark" aria-hidden="true">
          <Icon name="mic" size={14} />
        </span>
        <audio controls preload="metadata" src={src} aria-label={label ?? 'Note vocale'} />
      </div>
      <div className="note-audio-foot">
        <span className="note-audio-label">
          {!label ? 'Note vocale' : /^note vocale/i.test(label) ? label : `Note vocale · ${label}`}
        </span>
        {onTranscribe && (
          <button
            type="button"
            className="text-btn"
            onClick={() => void transcribe(false)}
            disabled={stage === 'busy'}
            title="Transcrire avec le modèle configuré"
          >
            <Icon name="sparkles" size={12} />
            {stage === 'busy' ? 'Transcription…' : 'Transcrire'}
          </button>
        )}
        {onRemove && (
          <button
            type="button"
            className="text-btn"
            onClick={() => void remove()}
            title="Supprimer l’enregistrement de la note et du disque"
          >
            <Icon name="trash" size={12} />
            Supprimer
          </button>
        )}
      </div>

      {stage === 'busy' && (
        <p className="note-audio-status" role="status">
          <Icon name="upload" size={12} />
          {sending === 'cloud' ? 'Enregistrement envoyé au modèle…' : 'Transcription en cours…'}
        </p>
      )}

      {stage === 'consent' && (
        <div className="note-audio-consent" role="group" aria-label="Envoyer l’enregistrement au modèle">
          <p>{message}</p>
          <p className="note-audio-warn">
            <Icon name="upload" size={12} /> L’enregistrement complet et votre demande sont envoyés au modèle. Rien
            n’est conservé par Vela.
          </p>
          <div className="note-audio-actions">
            <button type="button" className="action" onClick={() => setStage('idle')}>
              Garder local
            </button>
            <button type="button" className="action primary" onClick={() => void transcribe(true)}>
              Envoyer au modèle
            </button>
          </div>
        </div>
      )}

      {stage === 'message' && (
        <p className="note-audio-status" role="alert">
          <Icon name="warning" size={12} />
          {message}
        </p>
      )}
    </div>
  )
}
