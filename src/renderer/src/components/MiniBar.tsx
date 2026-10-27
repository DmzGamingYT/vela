import { useEffect, useRef, useState } from 'react'
import { MINI_CHROME_HEIGHT } from '@shared/mini'
import type { MiniState } from '@shared/types'
import Favicon from './Favicon'
import { Icon } from './Icon'

const EMPTY: MiniState = {
  url: '',
  title: '',
  host: '',
  loading: false,
  canGoBack: false,
  canGoForward: false,
  error: null,
  spaceId: '',
  spaceName: '',
  spaceColor: ''
}

/**
 * Barre de la petite fenêtre « Little Arc » : une adresse, l'espace qui prête
 * sa session, et les gestes utiles — revenir, recharger, installer la page dans
 * un vrai onglet, refermer. La page elle-même vit dans une vue native posée
 * juste sous cette barre, jamais dans le DOM de Vela.
 */
export default function MiniBar(): React.JSX.Element {
  const [state, setState] = useState<MiniState>(EMPTY)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const field = useRef<HTMLInputElement>(null)
  const editingRef = useRef(false)
  const stateRef = useRef(state)

  useEffect(() => {
    let alive = true
    const apply = (next: MiniState): void => {
      if (!alive) return
      stateRef.current = next
      setState(next)
      if (!editingRef.current) setDraft(next.url)
    }
    void window.vela.mini.state().then(apply)
    const offState = window.vela.mini.onState(apply)
    const offFocus = window.vela.mini.onFocusAddress(() => {
      editingRef.current = true
      setEditing(true)
      setDraft(stateRef.current.url)
      // Le focus tout de suite (l’élément actif est juste, même si l’image ne
      // se repeint pas), la sélection après le rendu qui repose la valeur.
      field.current?.focus()
      field.current?.select()
      window.requestAnimationFrame(() => field.current?.select())
    })
    // La barre n'écoute qu'à partir d'ici : elle se présente pour recevoir
    // l'état courant et le focus demandé pendant que la fenêtre s'ouvrait.
    window.vela.mini.ready()
    return () => {
      alive = false
      offState()
      offFocus()
    }
  }, [])

  const submit = (event: React.FormEvent): void => {
    event.preventDefault()
    const value = draft.trim()
    if (!value) return
    editingRef.current = false
    setEditing(false)
    void window.vela.mini.navigate(value)
  }

  const edit = (value: string): void => {
    editingRef.current = true
    setEditing(true)
    setDraft(value)
  }

  const stopEditing = (): void => {
    editingRef.current = false
    setEditing(false)
    setDraft(state.url)
  }

  const announcement = state.error
    ? `Erreur : ${state.error}`
    : state.loading
      ? `Chargement de ${state.host || 'la page'}`
      : state.host
        ? `${state.title || state.host} — ${state.host}`
        : 'Aucune page ouverte'
  const empty = !state.url && !state.loading
  // En cours d’édition, la barre montre ce qui est tapé ; sinon l’adresse réelle.
  const value = editing ? draft : state.url

  return (
    <div className="mini-root" data-platform={window.vela.platform}>
      <header className="mini-bar" style={{ height: MINI_CHROME_HEIGHT }}>
        <span
          className="mini-space"
          style={{ ['--mini-dot' as string]: state.spaceColor }}
          title={state.spaceName ? `Espace ${state.spaceName}` : undefined}
        >
          <i aria-hidden="true" />
          {state.spaceName}
        </span>

        <div className="mini-nav">
          <button
            type="button"
            className="mini-btn"
            onClick={() => void window.vela.mini.back()}
            disabled={!state.canGoBack}
            aria-label="Revenir en arrière"
            title="Revenir en arrière (⌘[)"
          >
            <Icon name="back" size={15} />
          </button>
          <button
            type="button"
            className="mini-btn"
            onClick={() => void window.vela.mini.forward()}
            disabled={!state.canGoForward}
            aria-label="Avancer"
            title="Avancer (⌘])"
          >
            <Icon name="forward" size={15} />
          </button>
          <button
            type="button"
            className="mini-btn"
            onClick={() => void (state.loading ? window.vela.mini.stop() : window.vela.mini.reload())}
            aria-label={state.loading ? 'Arrêter le chargement' : 'Recharger'}
            title={state.loading ? 'Arrêter le chargement' : 'Recharger (⌘R)'}
          >
            <Icon name={state.loading ? 'stop' : 'reload'} size={15} />
          </button>
        </div>

        <form className="mini-address" onSubmit={submit}>
          <Favicon url={state.url} label={state.host || 'vela'} size={15} spaceId={state.spaceId} />
          <input
            ref={field}
            type="text"
            value={value}
            placeholder="Adresse ou recherche"
            aria-label="Adresse ou recherche"
            spellCheck={false}
            autoComplete="off"
            onFocus={() => edit(state.url)}
            onChange={(event) => edit(event.target.value)}
            onBlur={stopEditing}
          />
          {state.error !== null && (
            <span className="mini-warn" title={state.error} role="img" aria-label={`Erreur : ${state.error}`}>
              <Icon name="warning" size={13} />
            </span>
          )}
        </form>

        <button
          type="button"
          className="mini-btn"
          onClick={() => void window.vela.mini.openInTab()}
          disabled={!/^https?:/i.test(state.url)}
          aria-label="Ouvrir dans un onglet"
          title="Ouvrir dans un onglet"
        >
          <Icon name="external" size={15} />
        </button>
        <button
          type="button"
          className="mini-btn mini-close"
          onClick={() => void window.vela.mini.close()}
          aria-label="Fermer la fenêtre"
          title="Fermer (Échap)"
        >
          <Icon name="close" size={15} />
        </button>
        {/* Le filet de chargement : la page arrive dessous, sans masquer le geste. */}
        {state.loading && <span className="mini-progress" aria-hidden="true" />}
      </header>

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      {empty && (
        <div className="mini-empty">
          <Icon name="globe" size={24} />
          <p>Tapez une adresse ou une recherche : elle s’ouvre ici, sans nouvel onglet.</p>
          <p className="mini-hint">
            Fermer cette fenêtre n’ajoute aucun onglet. La visite reste dans l’historique de l’espace.
          </p>
        </div>
      )}
    </div>
  )
}
