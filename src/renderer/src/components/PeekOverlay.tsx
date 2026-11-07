import { useCallback, useEffect, useRef, useState } from 'react'
import type { PeekState } from '@shared/types'
import { shortcut } from '../lib/format'
import { useBrowser } from '../store/browser'
import Favicon from './Favicon'
import { Icon } from './Icon'

/**
 * Coup d'œil : une carte posée au-dessus de la page courante, avec sa propre
 * page native. Le cadre, le fond et les actions sont ici ; la page est une
 * `WebContentsView` que le processus principal cale sur `.peek-surface`.
 */
export default function PeekOverlay() {
  const [state, setState] = useState<PeekState | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const surface = useRef<HTMLDivElement | null>(null)
  const field = useRef<HTMLInputElement | null>(null)
  const editingRef = useRef(false)
  const stateRef = useRef<PeekState | null>(null)
  const toast = useBrowser((store) => store.toast)
  const bookmarks = useBrowser((store) => store.view?.bookmarks ?? [])

  const open = Boolean(state)
  const pinned = Boolean(state?.url) && bookmarks.some((entry) => entry.url === state?.url)

  // Stable : les effets qui écoutent le clavier n'ont pas à se réabonner.
  const startEdit = useCallback((): void => {
    const current = stateRef.current
    if (!current) return
    editingRef.current = true
    setEditing(true)
    setDraft(current.url)
    window.requestAnimationFrame(() => {
      field.current?.focus()
      field.current?.select()
    })
  }, [])

  const stopEdit = (): void => {
    editingRef.current = false
    setEditing(false)
    setDraft(state?.url ?? '')
  }

  useEffect(() => {
    let alive = true
    const apply = (next: PeekState | null): void => {
      if (!alive) return
      stateRef.current = next
      setState(next)
      if (!editingRef.current) setDraft(next?.url ?? '')
      if (!next) {
        editingRef.current = false
        setEditing(false)
      }
    }
    void window.vela.peek.state().then(apply)
    const offState = window.vela.peek.onState(apply)
    const offFocus = window.vela.peek.onFocusAddress(startEdit)
    window.vela.peek.ready()
    return () => {
      alive = false
      offState()
      offFocus()
    }
  }, [startEdit])

  // La page native couvre exactement la surface mesurée : on la lui donne à
  // chaque changement de taille, et on la retire en refermant.
  useEffect(() => {
    if (!open) return
    const element = surface.current
    if (!element) return
    const send = (): void => {
      const rect = element.getBoundingClientRect()
      window.vela.peek.layout({
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      })
    }
    send()
    const observer = new ResizeObserver(send)
    observer.observe(element)
    window.addEventListener('resize', send)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', send)
      window.vela.peek.layout(null)
    }
  }, [open, state?.url])

  const openTab = (): void => {
    void window.vela.peek.openInTab()
  }

  const split = (): void => {
    void window.vela.peek.openInSplit()
  }

  const pin = async (): Promise<void> => {
    if (!state?.url) return
    const added = await window.vela.bookmarks.toggle({ url: state.url, title: state.title })
    toast(added ? 'Page ajoutée aux favoris.' : 'Page retirée des favoris.')
  }

  const navigate = (event: React.FormEvent): void => {
    event.preventDefault()
    const value = draft.trim()
    if (!value) return
    editingRef.current = false
    setEditing(false)
    void window.vela.peek.navigate(value)
  }

  // La carte gère ses touches avant le reste de la coque : Échap ferme, ⌘L
  // remonte à l'adresse, Entrée ouvre l'onglet (Maj + Entrée : vue scindée).
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.defaultPrevented) return
      if (event.key === 'Escape') {
        event.preventDefault()
        void window.vela.peek.close()
        return
      }
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'l') {
        event.preventDefault()
        startEdit()
        return
      }
      if (editingRef.current) return
      if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault()
        if (event.shiftKey) split()
        else openTab()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, state?.url, startEdit])

  if (!state) return null

  return (
    <div
      className="peek-layer"
      role="dialog"
      aria-modal="true"
      aria-label="Coup d’œil"
      onMouseDown={() => void window.vela.peek.close()}
    >
      <section className="peek-card" onMouseDown={(event) => event.stopPropagation()}>
        <header className="peek-head">
          <Favicon url={state.url} label={state.host || 'aperçu'} size={20} spaceId={state.spaceId} />
          {editing ? (
            <form className="peek-address" onSubmit={navigate}>
              <input
                ref={field}
                type="text"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onBlur={stopEdit}
                onKeyDown={(event) => {
                  if (event.key !== 'Escape') return
                  event.preventDefault()
                  event.stopPropagation()
                  stopEdit()
                }}
                placeholder="Adresse ou recherche"
                aria-label="Adresse ou recherche"
                spellCheck={false}
                autoComplete="off"
              />
            </form>
          ) : (
            <button
              type="button"
              className="peek-meta"
              onClick={startEdit}
              title={`Modifier l’adresse (${shortcut('L')})`}
            >
              <span className="peek-title">{state.title || state.host || 'Nouvel aperçu'}</span>
              <span className="peek-host">{state.host || 'Saisir une adresse'}</span>
            </button>
          )}
          <span className="peek-space" style={{ ['--peek-dot' as string]: state.spaceColor }}>
            <i aria-hidden="true" />
            {state.spaceName}
          </span>
          <button
            type="button"
            className="peek-btn"
            onClick={() => void pin()}
            disabled={!state.url}
            title={pinned ? 'Retirer des favoris' : 'Ajouter aux favoris'}
          >
            {pinned ? 'Épinglé' : 'Épingler'}
          </button>
          <button
            type="button"
            className="peek-icon"
            onClick={() => void window.vela.peek.close()}
            aria-label="Fermer le coup d’œil"
            title="Fermer (Échap)"
          >
            <Icon name="close" size={16} />
          </button>
        </header>

        <div className="peek-body">
          <div ref={surface} className="peek-surface" />
          {!state.url && (
            <form className="peek-empty" onSubmit={navigate}>
              <span className="peek-empty-mark" aria-hidden="true">
                <Icon name="globe" size={20} />
              </span>
              <p>Une page à regarder sans ouvrir d’onglet.</p>
              <div className="peek-empty-field">
                <input
                  type="text"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Adresse ou recherche"
                  aria-label="Adresse ou recherche"
                  spellCheck={false}
                  autoComplete="off"
                  autoFocus
                />
                <button type="submit" className="peek-btn is-primary">
                  Aperçu
                </button>
              </div>
              <span className="peek-empty-hint">
                {shortcut('⌥N')} depuis n’importe où · Échap pour fermer
              </span>
            </form>
          )}
          {state.loading && <span className="peek-progress" aria-hidden="true" />}
        </div>

        <footer className="peek-foot">
          <span className="peek-hint" role={state.error ? 'alert' : undefined}>
            {state.error
              ? `Erreur : ${state.error}`
              : state.url
                ? `Depuis ${state.spaceName} · aucun onglet créé`
                : 'Le coup d’œil ne crée aucun onglet'}
          </span>
          <button type="button" className="peek-btn" onClick={split} disabled={!state.url}>
            Scindée <kbd>⇧⏎</kbd>
          </button>
          <button
            type="button"
            className="peek-btn is-primary"
            onClick={openTab}
            disabled={!state.url}
          >
            Ouvrir <kbd>⏎</kbd>
          </button>
        </footer>
      </section>
    </div>
  )
}
