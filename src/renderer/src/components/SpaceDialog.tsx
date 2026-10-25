import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { SPACE_COLORS } from '@shared/defaults'
import { useBrowser } from '../store/browser'
import { Icon } from './Icon'

export default function SpaceDialog() {
  const view = useBrowser((state) => state.view)
  const editId = useBrowser((state) => state.spaceEditId)
  const setOverlay = useBrowser((state) => state.setOverlay)
  const createSpace = useBrowser((state) => state.createSpace)
  const updateSpace = useBrowser((state) => state.updateSpace)
  const removeSpace = useBrowser((state) => state.removeSpace)

  const existing = view?.spaces.find((space) => space.id === editId)
  const [name, setName] = useState(existing?.name ?? '')
  const [color, setColor] = useState(
    existing?.color ?? SPACE_COLORS[(view?.spaces.length ?? 0) % SPACE_COLORS.length]
  )
  const [confirming, setConfirming] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  if (!view) return null

  const preview = name.trim() || `Espace ${view.spaces.length + 1}`

  return (
    <div className="overlay" onMouseDown={() => setOverlay(null)}>
      <div className="sheet space-sheet" role="dialog" aria-label="Espace" onMouseDown={(event) => event.stopPropagation()}>
        <header className="sheet-head">
          <div>
            <p className="eyebrow">
              <span className="eyebrow-dot" />
              {existing ? 'Modifier' : 'Nouvel espace'}
            </p>
            <h1>{existing ? existing.name : 'Un espace à part'}</h1>
            <p className="sheet-lede">
              Chaque espace garde ses cookies, ses sessions et ses onglets. Deux comptes au même site, sans conflit.
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={() => setOverlay(null)} title="Fermer">
            <Icon name="close" size={18} />
          </button>
        </header>

        <form
          className="space-form"
          onSubmit={(event) => {
            event.preventDefault()
            if (existing) void updateSpace(existing.id, { name: preview, color })
            else void createSpace(preview, color)
          }}
        >
          <div className="space-preview">
            <span className="space-preview-chip" style={{ '--space': color } as CSSProperties}>
              {preview.slice(0, 1).toUpperCase()}
            </span>
            <span className="space-preview-copy">
              <strong>{preview}</strong>
              <span>Cookies, historique et onglets isolés</span>
            </span>
          </div>

          <label className="field">
            <span>Nom</span>
            <input
              ref={inputRef}
              className="space-name-input"
              value={name}
              maxLength={40}
              placeholder="Travail, Veille, Personnel…"
              onChange={(event) => setName(event.target.value)}
            />
          </label>

          <div>
            <span className="field-label">Couleur</span>
            <div className="space-swatches" style={{ marginTop: 8 }}>
              {SPACE_COLORS.map((swatch) => (
                <button
                  type="button"
                  key={swatch}
                  className="swatch"
                  data-active={swatch === color}
                  style={{ background: swatch }}
                  aria-label={swatch}
                  onClick={() => setColor(swatch)}
                />
              ))}
            </div>
          </div>

          <div className="dialog-foot" style={{ padding: '6px 0 0' }}>
            {existing && view.spaces.length > 1 ? (
              <button
                type="button"
                className="danger-btn"
                data-confirming={confirming}
                onClick={() => {
                  if (!confirming) {
                    setConfirming(true)
                    return
                  }
                  void removeSpace(existing.id)
                }}
              >
                {confirming ? 'Confirmer la suppression' : 'Supprimer cet espace'}
              </button>
            ) : (
              <span />
            )}
            <div className="dialog-actions">
              <button type="button" className="action" onClick={() => setOverlay(null)}>
                Annuler
              </button>
              <button type="submit" className="action primary">
                <Icon name={existing ? 'check' : 'plus'} size={14} />
                {existing ? 'Enregistrer' : 'Créer l’espace'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
