import { useEffect, useRef, useState } from 'react'
import type { TabView } from '@shared/types'
import { engineLabel, hostOf, isHomeUrl, prettyUrl } from '@shared/url'
import { shortcut } from '../../lib/format'
import { useBrowser } from '../../store/browser'
import { Icon } from '../Icon'
import BarButton from '../BarButton'
import TileMenu, { type TileMenuItem } from '../tabs/TileMenu'

interface PaneHeaderProps {
  tab: TabView
  primary: boolean
  secondary?: boolean
}

/** Une ligne de la liste d'adresses : une page connue ou une recherche. */
interface Suggestion {
  id: string
  url: string
  title: string
  host: string
  search?: boolean
}

const MAX_SUGGESTIONS = 5

export default function PaneHeader({ tab, primary, secondary = false }: PaneHeaderProps) {
  const view = useBrowser((state) => state.view)
  const navigate = useBrowser((state) => state.navigate)
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
  const [focused, setFocused] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [draft, setDraft] = useState('')
  const [activeIndex, setActiveIndex] = useState(-1)
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

  // Suggestions : ce que l'appareil connaît d'abord (favoris, historique),
  // puis la recherche. Taper « you » propose youtube.com avant de proposer
  // d'envoyer « you » au moteur.
  const suggestions: Suggestion[] = []
  if (focused) {
    const needle = draft.trim().toLowerCase()
    const seen = new Set<string>()
    const pool = [
      ...(view?.bookmarks ?? []).map((bookmark) => ({
        url: bookmark.url,
        title: bookmark.title
      })),
      ...(view?.history ?? []).map((entry) => ({ url: entry.url, title: entry.title }))
    ]
    for (const item of pool) {
      if (!item.url || isHomeUrl(item.url) || seen.has(item.url)) continue
      const itemHost = hostOf(item.url)
      const title = (item.title || '').trim() || itemHost
      if (needle && !`${title} ${item.url}`.toLowerCase().includes(needle)) continue
      seen.add(item.url)
      suggestions.push({ id: item.url, url: item.url, title, host: itemHost })
      if (suggestions.length >= MAX_SUGGESTIONS) break
    }
    const query = draft.trim()
    if (query) {
      const engine = engineLabel(
        view?.settings.searchEngine ?? 'duckduckgo',
        view?.settings.customEngines.find((entry) => entry.id === view.settings.customEngineId)?.name
      )
      suggestions.push({
        id: 'search',
        url: query,
        title: `Rechercher « ${query} »`,
        host: engine,
        search: true
      })
    }
  }
  const suggestionsOpen = focused && suggestions.length > 0

  const pick = (suggestion: Suggestion): void => {
    navigate(tab.id, suggestion.url)
    setFocused(false)
    setActiveIndex(-1)
    inputRef.current?.blur()
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
          aria-keyshortcuts={window.vela.platform === 'darwin' ? 'Meta+L' : 'Control+L'}
          aria-expanded={suggestionsOpen}
          aria-controls={suggestionsOpen ? 'address-suggest' : undefined}
          aria-activedescendant={
            suggestionsOpen && activeIndex >= 0
              ? `address-suggest-${activeIndex}`
              : undefined
          }
          onChange={(event) => {
            setDraft(event.target.value)
            setActiveIndex(-1)
          }}
          onFocus={(event) => {
            setFocused(true)
            setDraft(home ? '' : tab.url)
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
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setActiveIndex((index) => Math.min(suggestions.length - 1, index + 1))
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              setActiveIndex((index) => Math.max(-1, index - 1))
            } else if (event.key === 'Enter' && activeIndex >= 0) {
              event.preventDefault()
              pick(suggestions[activeIndex])
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

        {suggestionsOpen && (
          <ul
            id="address-suggest"
            className="address-suggest"
            role="listbox"
            aria-label="Suggestions d’adresses"
            // Le clic sur une suggestion ne doit pas voler le focus au champ
            // avant que la sélection ait pu se faire.
            onMouseDown={(event) => event.preventDefault()}
          >
            {suggestions.map((suggestion, index) => (
              <li key={suggestion.id}>
                <button
                  type="button"
                  id={`address-suggest-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  className="address-suggest-row"
                  data-active={index === activeIndex ? 'true' : undefined}
                  data-search={suggestion.search ? 'true' : undefined}
                  onClick={() => pick(suggestion)}
                >
                  <span className="address-suggest-icon" aria-hidden="true">
                    <Icon name={suggestion.search ? 'search' : 'globe'} size={13} />
                  </span>
                  <span className="address-suggest-title">{suggestion.title}</span>
                  <span className="address-suggest-host">{suggestion.host}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </form>

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
