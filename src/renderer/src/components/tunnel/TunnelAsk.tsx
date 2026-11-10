import { useEffect, useMemo, useRef, useState } from 'react'
import { queryVariants, TUNNEL_DEPTHS, type TunnelDepth } from '@shared/tunnel'
import { timeAgo } from '../../lib/format'
import { useBrowser } from '../../store/browser'
import { useTunnel } from '../../store/tunnel'
import { Icon } from '../Icon'

const IDEAS = [
  'Comparer les hébergeurs d’images libres',
  'Utiliser l’IA pour rédiger des textes',
  'Histoire de la photographie argentique'
]

/** Premier temps : poser la question, ou reprendre une carte enregistrée. */
export default function TunnelAsk() {
  const query = useTunnel((s) => s.query)
  const running = useTunnel((s) => s.running)
  const runTunnel = useTunnel((s) => s.runTunnel)
  const depth = useTunnel((s) => s.depth)
  const setDepth = useTunnel((s) => s.setDepth)
  const variants = useTunnel((s) => s.variants)
  const setVariants = useTunnel((s) => s.setVariants)
  const maps = useTunnel((s) => s.maps)
  const refreshMaps = useTunnel((s) => s.refreshMaps)
  const loadMap = useTunnel((s) => s.loadMap)
  const setProjectsOpen = useTunnel((s) => s.setProjectsOpen)
  const spaceId = useBrowser((s) => s.view?.activeSpaceId ?? '')
  const [draft, setDraft] = useState<string | null>(null)
  const [mountedAt] = useState(() => Date.now())
  const inputRef = useRef<HTMLInputElement | null>(null)
  // La question vient du store tant que personne n'a rien tapé : revenir à
  // l'écran de question après une recherche montre la dernière question.
  const value = draft ?? query
  const shown = variants.length > 0 ? variants : queryVariants(value)

  useEffect(() => {
    void refreshMaps()
  }, [refreshMaps])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const recent = useMemo(() => {
    const rows = maps.filter((map) => !map.spaceId || map.spaceId === spaceId).slice(0, 4)
    const max = Math.max(1, ...rows.map((row) => row.sourceCount))
    return rows.map((row) => ({
      ...row,
      width: Math.max(8, Math.round((row.sourceCount / max) * 100))
    }))
  }, [maps, spaceId])

  const submit = (): void => {
    const clean = value.trim()
    if (!clean) return
    setDraft(null)
    const chosen = shown.map((entry) => entry.trim()).filter(Boolean)
    void runTunnel(clean, { depth, variants: chosen })
  }

  const change = (next: string): void => {
    setDraft(next)
    setVariants(queryVariants(next))
  }

  return (
    <div className="tw-screen tw-ask">
      <div className="tw-ask-inner">
        <p className="tw-eyebrow">
          <i aria-hidden="true" />
          Atelier · nouveau tunnel
        </p>
        <h1>Quelle question voulez-vous ouvrir&nbsp;?</h1>
        <p className="tw-lede">
          Vela cherche des sources réelles, les range par angle et laisse tomber le bruit. Vous
          gardez ce qui compte, la synthèse garde ses citations.
        </p>

        <form
          className="tw-field"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <Icon name="search" size={16} />
          <input
            ref={inputRef}
            value={value}
            onChange={(event) => change(event.target.value)}
            placeholder="Un sujet, une question, un angle"
            aria-label="Question du tunnel"
          />
          <button
            type="submit"
            className="tw-btn tw-btn-primary"
            disabled={!value.trim() || running}
          >
            Ouvrir le tunnel <kbd>⌘↵</kbd>
          </button>
        </form>

        <div className="tw-depth" role="radiogroup" aria-label="Profondeur de recherche">
          <span className="tw-k">Profondeur</span>
          <div className="tw-depth-options">
            {TUNNEL_DEPTHS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="radio"
                aria-checked={depth === entry.id}
                data-active={depth === entry.id}
                onClick={() => setDepth(entry.id as TunnelDepth)}
              >
                <b>{entry.label}</b>
                <span>≈ {entry.pages} pages · {entry.estimate}</span>
              </button>
            ))}
          </div>
        </div>

        {value.trim() !== '' && (
          <div className="tw-variants">
            <div className="tw-variants-head">
              <span className="tw-k">Requêtes lancées</span>
              <em>{shown.length} variantes · modifiables</em>
            </div>
            <div className="tw-variants-list">
              {shown.map((entry, index) => (
                <span key={index} className="tw-variant">
                  <input
                    value={entry}
                    aria-label={`Variante ${index + 1}`}
                    onChange={(event) => {
                      const next = [...shown]
                      next[index] = event.target.value
                      setVariants(next)
                    }}
                  />
                  <button
                    type="button"
                    aria-label={`Retirer la variante ${index + 1}`}
                    title="Retirer"
                    onClick={() => setVariants(shown.filter((_, at) => at !== index))}
                  >
                    <Icon name="close" size={11} />
                  </button>
                </span>
              ))}
              <button
                type="button"
                className="tw-variant-add"
                onClick={() => setVariants([...shown, ''])}
              >
                + Ajouter
              </button>
            </div>
          </div>
        )}

        <div className="tw-tips">
          {IDEAS.map((idea) => (
            <button
              key={idea}
              type="button"
              className="tw-tip"
              onClick={() => {
                change(idea)
                inputRef.current?.focus()
              }}
            >
              + {idea}
            </button>
          ))}
        </div>

        <div className="tw-block">
          <h2>Reprendre</h2>
          {recent.length === 0 ? (
            <p className="tw-note">
              Aucune carte pour l’instant : la première question ouvrira la liste.
            </p>
          ) : (
            <div className="tw-recent">
              {recent.map((map) => (
                <button
                  key={map.id}
                  type="button"
                  className="tw-recent-row"
                  onClick={() => void loadMap(map.id)}
                >
                  <span className="tw-recent-main">
                    <b>{map.title}</b>
                    <span>
                      {map.sourceCount} source{map.sourceCount > 1 ? 's' : ''}
                      {map.angleCount
                        ? ` · ${map.angleCount} angle${map.angleCount > 1 ? 's' : ''}`
                        : ''}
                    </span>
                  </span>
                  <span className="tw-recent-bar" aria-hidden="true">
                    <i style={{ width: `${map.width}%` }} />
                  </span>
                  <span className="tw-recent-meta">{timeAgo(map.updatedAt, mountedAt)}</span>
                </button>
              ))}
              <button type="button" className="tw-link" onClick={() => setProjectsOpen(true)}>
                Toutes les cartes
              </button>
            </div>
          )}
        </div>

        <p className="tw-note tw-privacy">
          <Icon name="lock" size={12} /> Rien n’est envoyé à un moteur : le tunnel interroge des
          sources publiques, mesure la correspondance localement et garde la trace de chaque page.
        </p>
      </div>
    </div>
  )
}
