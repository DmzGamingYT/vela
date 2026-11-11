import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { TabView } from '@shared/types'
import { hostOf, isHomeUrl, prettyUrl } from '@shared/url'
import { shortcut } from '../../lib/format'
import { buildAddressSuggestions, type AddressSuggestion } from '../../lib/addressSuggestions'
import { useBrowser } from '../../store/browser'
import { Icon } from '../Icon'
import BarButton from '../BarButton'
import TileMenu, { type TileMenuItem } from '../tabs/TileMenu'
import AddressSuggestions from './AddressSuggestions'

interface PaneHeaderProps {
  tab: TabView
  primary: boolean
  secondary?: boolean
}

export default function PaneHeader({ tab, primary, secondary = false }: PaneHeaderProps) {
  const view = useBrowser((state) => state.view)
  const navigate = useBrowser((state) => state.navigate)
  const newTab = useBrowser((state) => state.newTab)
  const selectTab = useBrowser((state) => state.selectTab)
  const back = useBrowser((state) => state.back)
  const forward = useBrowser((state) => state.forward)
  const reload = useBrowser((state) => state.reload)
  const stop = useBrowser((state) => state.stop)
  const splitToggle = useBrowser((state) => state.splitToggle)
  const overlay = useBrowser((state) => state.overlay)
  const setOverlay = useBrowser((state) => state.setOverlay)
  const toggleBookmark = useBrowser((state) => state.toggleBookmark)
  const toast = useBrowser((state) => state.toast)

  const inputRef = useRef<HTMLInputElement>(null)
  const addressRef = useRef<HTMLFormElement>(null)
  const [focused, setFocused] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [draft, setDraft] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [anchor, setAnchor] = useState({ left: 0, top: 0, width: 0 })
  // Clic long sur « Précédent » : le parcours de l'onglet, pas un menu
  // déroulant au survol (geste discret, mais qui ne cache aucune fonction).
  const [backMenu, setBackMenu] = useState<{
    x: number
    y: number
    items: TileMenuItem[]
  } | null>(null)
  const pressTimer = useRef<number | null>(null)
  const longPressed = useRef(false)
  const home = isHomeUrl(tab.url)
  const bookmarked = Boolean(view?.bookmarks.some((bookmark) => bookmark.url === tab.url))

  useEffect(() => {
    if (focused) return
    queueMicrotask(() => setDraft(home ? '' : tab.url))
  }, [tab.url, home, focused])

  // L'origine reste lisible au repos. Le titre d'une page est écrit par la
  // page elle-même : l'afficher seul permet à un site d'imiter un autre
  // domaine. L'hôte vient de l'URL effective, sans « https:// » ni « www. ».
  const host = home ? '' : hostOf(tab.url)
  const pageName = (tab.title || '').trim() || prettyUrl(tab.url)
  const resting = hovered ? prettyUrl(tab.url) : host || pageName
  const display = focused ? draft : home ? '' : resting
  const canClear = focused && draft.trim().length > 0

  const pathLabel = (() => {
    if (home) return ''
    try {
      const parsed = new URL(tab.url)
      const path = `${parsed.pathname}${parsed.search}`
      return path === '/' ? '' : path
    } catch {
      return ''
    }
  })()

  const suggestions = useMemo(
    () =>
      focused && view
        ? buildAddressSuggestions(view, tab.id, draft)
        : { groups: [], rows: [] },
    [focused, view, tab.id, draft]
  )
  const suggestionsOpen = focused && suggestions.rows.length > 0
  const suggestionsId = `address-suggest-${tab.id.replace(/[^a-z0-9_-]/gi, '')}`

  useEffect(() => {
    if (!suggestionsOpen) {
      queueMicrotask(() => setActiveIndex(-1))
      return
    }
    queueMicrotask(() =>
      setActiveIndex((current) =>
        current >= 0 && current < suggestions.rows.length ? current : 0
      )
    )
  }, [suggestionsOpen, suggestions.rows.length])

  // Le popover est un calque HTML : la vue native est retirée derrière son
  // épreuve le temps de l'ouverture, sans changer sa taille ni sa géométrie.
  useEffect(() => {
    if (!suggestionsOpen) return
    const state = useBrowser.getState()
    state.beginMenu()
    if (state.view) window.vela?.views?.layout({ panes: [], overlay: true })
    return () => state.endMenu()
  }, [suggestionsOpen])

  useLayoutEffect(() => {
    if (!focused) return
    const sync = (): void => {
      const rect = addressRef.current?.getBoundingClientRect()
      if (!rect) return
      setAnchor({ left: rect.left, top: rect.bottom + 8, width: rect.width })
    }
    sync()
    window.addEventListener('resize', sync)
    window.addEventListener('scroll', sync, true)
    return () => {
      window.removeEventListener('resize', sync)
      window.removeEventListener('scroll', sync, true)
    }
  }, [focused, tab.id])

  useEffect(() => {
    if (!overlay) return
    queueMicrotask(() => {
      setFocused(false)
      setActiveIndex(-1)
    })
  }, [overlay])

  const closeSuggestions = (): void => {
    setFocused(false)
    setActiveIndex(-1)
    inputRef.current?.blur()
  }

  const pick = (suggestion: AddressSuggestion, newWindow = false): void => {
    if (suggestion.kind === 'tab' && suggestion.tabId && !newWindow) {
      selectTab(suggestion.tabId)
    } else if (newWindow) {
      newTab(suggestion.url)
    } else {
      navigate(tab.id, suggestion.url)
    }
    closeSuggestions()
  }

  const complete = (suggestion: AddressSuggestion): void => {
    setDraft(suggestion.complete)
    setActiveIndex(0)
    inputRef.current?.focus()
  }

  const cancelPress = (): void => {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
  }

  const openBackMenu = async (element: HTMLElement): Promise<void> => {
    const entries = await window.vela.tabs.entries(tab.id).catch(() => [])
    const current = entries.findIndex((entry) => entry.url === tab.url)
    const previous = entries
      .slice(0, current < 0 ? entries.length : current)
      .reverse()
      .slice(0, 12)
    if (previous.length === 0) return
    longPressed.current = true
    const rect = element.getBoundingClientRect()
    setBackMenu({
      x: rect.left,
      y: rect.bottom + 4,
      items: previous.map((entry) => ({
        id: `back-${entry.index}`,
        label: (entry.title || prettyUrl(entry.url)).slice(0, 90),
        icon: 'clock',
        onSelect: () => void window.vela.tabs.goto(tab.id, entry.index)
      }))
    })
  }

  const copyAddress = (): void => {
    void navigator.clipboard.writeText(tab.url).then(
      () => toast('Adresse copiée.'),
      () => toast('Copie impossible.', 'error')
    )
  }

  return (
    <div
      className="pane-head"
      role="group"
      aria-label={primary ? 'Barre d’adresse' : 'Barre d’adresse secondaire'}
      data-primary={primary}
      onDoubleClick={(event) => {
        // Seule une zone libre réagit : double-cliquer dans le champ ou sur un
        // bouton ne doit pas redimensionner la fenêtre.
        if ((event.target as HTMLElement).closest('button, input, .address')) return
        void window.vela.zoomWindow()
      }}
    >
      <div className="nav-group">
        <button
          type="button"
          className="icon-btn"
          disabled={!tab.canGoBack}
          onClick={() => {
            if (longPressed.current) {
              longPressed.current = false
              return
            }
            back(tab.id)
          }}
          onPointerDown={(event) => {
            const element = event.currentTarget
            cancelPress()
            pressTimer.current = window.setTimeout(() => void openBackMenu(element), 450)
          }}
          onPointerUp={cancelPress}
          onPointerLeave={cancelPress}
          onPointerCancel={cancelPress}
          title={`Précédent (${shortcut('[')}) — clic long pour la liste`}
          aria-label="Précédent"
        >
          <Icon name="back" size={18} strokeWidth={1.5} />
        </button>
        <button
          type="button"
          className="icon-btn"
          disabled={!tab.canGoForward}
          onClick={() => forward(tab.id)}
          title={`Suivant (${shortcut(']')})`}
          aria-label="Suivant"
        >
          <Icon name="forward" size={18} strokeWidth={1.5} />
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={() => (tab.loading ? stop(tab.id) : reload(tab.id))}
          title={`${tab.loading ? 'Arrêter' : 'Recharger'} (${shortcut('R')})`}
          aria-label={tab.loading ? 'Arrêter le chargement' : 'Recharger'}
        >
          <Icon name={tab.loading ? 'close' : 'reload'} size={18} strokeWidth={1.5} />
        </button>
      </div>

      <form
        ref={addressRef}
        className="address"
        aria-label={primary ? 'Adresse de l’onglet' : 'Adresse de l’onglet secondaire'}
        data-focused={focused}
        data-home={home}
        data-resting={!home && !focused}
        title={home ? undefined : `${tab.title || prettyUrl(tab.url)} — ${tab.url}`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onSubmit={(event) => {
          event.preventDefault()
          const value = draft.trim()
          if (!value) return
          navigate(tab.id, value)
          setFocused(false)
          setActiveIndex(-1)
          inputRef.current?.blur()
        }}
      >
        {/* Une icône à gauche du champ : la connexion se lit avant l'adresse,
            et son panneau (site, permissions, protection) s'ouvre d'ici. */}
        {!home && (
          <button
            type="button"
            className="address-shield"
            data-active={overlay === 'shield' ? 'true' : undefined}
            aria-label={
              tab.blocked > 0
                ? `Connexion sûre — ${tab.blocked} traceur${tab.blocked > 1 ? 's' : ''} arrêté${tab.blocked > 1 ? 's' : ''}`
                : 'Connexion sûre — protection de la page'
            }
            title="Connexion sûre · site, permissions, protection"
            onClick={() => setOverlay(overlay === 'shield' ? null : 'shield')}
          >
            <Icon name={tab.url.startsWith('https:') ? 'lock' : 'shield'} size={14} />
          </button>
        )}

        {!home && !focused && (
          <span className="address-identity" aria-hidden="true">
            <span className="address-host">{host}</span>
            {pathLabel && <span className="address-path">{pathLabel}</span>}
          </span>
        )}

        <input
          ref={inputRef}
          className="address-input"
          value={display}
          placeholder="Rechercher ou saisir une adresse"
          spellCheck={false}
          autoComplete="off"
          aria-label="Adresse"
          aria-autocomplete="list"
          aria-keyshortcuts={window.vela.platform === 'darwin' ? 'Meta+L' : 'Control+L'}
          aria-expanded={suggestionsOpen}
          aria-controls={suggestionsOpen ? suggestionsId : undefined}
          aria-activedescendant={
            suggestionsOpen && activeIndex >= 0
              ? `${suggestionsId}-option-${activeIndex}`
              : undefined
          }
          onChange={(event) => {
            setDraft(event.target.value)
            setActiveIndex(0)
          }}
          onFocus={(event) => {
            setFocused(true)
            setDraft(home ? '' : tab.url)
            setActiveIndex(0)
            requestAnimationFrame(() => event.target.select())
          }}
          onBlur={() => {
            setFocused(false)
            setActiveIndex(-1)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              // Échap restaure l'adresse affichée et referme la liste.
              setDraft(home ? '' : tab.url)
              setActiveIndex(-1)
              setFocused(false)
              event.currentTarget.blur()
              return
            }
            if (!suggestionsOpen) return
            const count = suggestions.rows.length
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setActiveIndex((index) => (index < 0 ? 0 : (index + 1) % count))
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              setActiveIndex((index) => (index <= 0 ? count - 1 : index - 1))
            } else if (event.key === 'Tab' && !event.shiftKey) {
              const current = suggestions.rows[activeIndex]
              if (!current) return
              event.preventDefault()
              complete(current)
            } else if (event.key === 'Enter' && activeIndex >= 0) {
              const current = suggestions.rows[activeIndex]
              if (!current) return
              event.preventDefault()
              pick(current, event.metaKey || event.ctrlKey)
            }
          }}
        />

        {canClear && (
          <button
            type="button"
            className="address-clear"
            aria-label="Effacer"
            title="Effacer"
            onClick={() => {
              setDraft('')
              inputRef.current?.focus()
            }}
          >
            <Icon name="close" size={16} />
          </button>
        )}

        {tab.agentSent && (
          <span
            className="address-agent-sent"
            title="Cette page a été envoyée au fournisseur de modèle pour l’agent"
          >
            <Icon name="sparkles" size={12} /> Envoyée au modèle
          </span>
        )}

        {!home && (
          <div className="address-tools">
            {/* L'étoile revient dans le champ, à la place qu'elle a chez Safari :
                garder la page se décide là où on lit son adresse. */}
            <button
              type="button"
              className="address-star"
              data-active={bookmarked ? 'true' : undefined}
              aria-pressed={bookmarked}
              aria-label={bookmarked ? 'Retirer des favoris' : 'Ajouter aux favoris'}
              title={`${bookmarked ? 'Retirer des favoris' : 'Garder cette page'} (${shortcut('D')})`}
              onClick={() => void toggleBookmark(tab.id)}
            >
              <Icon name="star" size={15} filled={bookmarked} />
            </button>
            <button
              type="button"
              className="address-copy"
              aria-label="Copier l’adresse"
              title="Copier l’adresse"
              onClick={copyAddress}
            >
              <Icon name="copy" size={14} />
            </button>
          </div>
        )}

      </form>

      {suggestionsOpen && anchor.width > 0 && (
        <AddressSuggestions
          listId={suggestionsId}
          anchor={anchor}
          groups={suggestions.groups}
          activeIndex={activeIndex}
          onActive={setActiveIndex}
          onPick={(index, newWindow) => {
            const row = suggestions.rows[index]
            if (row) pick(row, newWindow)
          }}
          onClose={closeSuggestions}
        />
      )}

      <div className="pane-tools">
        {secondary && (
          <BarButton icon="close" label="Fermer la vue scindée" onClick={() => splitToggle()} />
        )}
      </div>

      {/* La page charge : un trait d'accent court sous la barre, plutôt qu'un
          bouton qui change de sens sans le dire. */}
      {tab.loading && <span className="pane-progress" aria-hidden="true" />}

      {backMenu && (
        <TileMenu
          x={backMenu.x}
          y={backMenu.y}
          label="Pages précédentes"
          items={backMenu.items}
          onClose={() => {
            // Le prochain clic sur « Précédent » doit revenir en arrière : le
            // drapeau du clic long ne survit pas à la fermeture du menu.
            longPressed.current = false
            setBackMenu(null)
          }}
        />
      )}
    </div>
  )
}
