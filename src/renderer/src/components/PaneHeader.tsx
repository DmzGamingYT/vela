import { useEffect, useRef, useState } from 'react'
import type { TabView } from '@shared/types'
import { hostOf, isHomeUrl, prettyUrl } from '@shared/url'
import { shortcut } from '../lib/format'
import { useBrowser } from '../store/browser'
import { Icon } from './Icon'

interface PaneHeaderProps {
  tab: TabView
  primary: boolean
  secondary?: boolean
}

export default function PaneHeader({ tab, primary, secondary = false }: PaneHeaderProps) {
  const navigate = useBrowser((state) => state.navigate)
  const back = useBrowser((state) => state.back)
  const forward = useBrowser((state) => state.forward)
  const reload = useBrowser((state) => state.reload)
  const stop = useBrowser((state) => state.stop)
  const splitToggle = useBrowser((state) => state.splitToggle)
  const toggleBookmark = useBrowser((state) => state.toggleBookmark)
  const setOverlay = useBrowser((state) => state.setOverlay)
  const bookmarked = useBrowser((state) =>
    Boolean(state.view?.bookmarks.some((bookmark) => bookmark.url === tab.url))
  )

  const inputRef = useRef<HTMLInputElement>(null)
  const [focused, setFocused] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [draft, setDraft] = useState('')
  const home = isHomeUrl(tab.url)

  useEffect(() => {
    if (!focused) setDraft(home ? '' : tab.url)
  }, [tab.url, home, focused])

  // Façon Dia/Zephium : au repos on lit le nom de la page, au survol l'adresse,
  // au focus l'URL complète éditable.
  const pageName = (tab.title || '').trim() || prettyUrl(tab.url)
  const resting = hovered ? prettyUrl(tab.url) : pageName
  const display = focused ? draft : home ? '' : resting

  return (
    <div
      className="pane-head"
      role="group"
      aria-label={primary ? 'Barre d’adresse' : 'Barre d’adresse secondaire'}
      data-primary={primary}
    >
      <div className="nav-group">
        <button type="button" className="icon-btn" disabled={!tab.canGoBack} onClick={() => back(tab.id)} title="Précédent">
          <Icon name="back" size={16} />
        </button>
        <button
          type="button"
          className="icon-btn"
          disabled={!tab.canGoForward}
          onClick={() => forward(tab.id)}
          title="Suivant"
        >
          <Icon name="forward" size={16} />
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={() => (tab.loading ? stop(tab.id) : reload(tab.id))}
          title={tab.loading ? 'Arrêter' : 'Recharger'}
        >
          <Icon name={tab.loading ? 'close' : 'reload'} size={15} />
        </button>
      </div>

      <form
        className="address"
        aria-label={primary ? 'Adresse de l’onglet' : 'Adresse de l’onglet secondaire'}
        data-focused={focused}
        data-home={home}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onSubmit={(event) => {
          event.preventDefault()
          const value = draft.trim()
          if (!value) return
          navigate(tab.id, value)
          setFocused(false)
          inputRef.current?.blur()
        }}
      >
        <span className="address-icon">
          <Icon name={home ? 'search' : 'lock'} size={13} />
        </span>
        {!home && !focused && !hovered && tab.url.startsWith('https:') && (
          <span className="address-scheme">https</span>
        )}
        <input
          ref={inputRef}
          className="address-input"
          value={display}
          placeholder={home ? "Vela — Accueil" : "Rechercher ou saisir une adresse"}
          spellCheck={false}
          autoComplete="off"
          aria-label="Adresse"
          // Le raccourci se lit dans l'arbre d'accessibilité, pas seulement
          // dans l'infobulle visuelle qui s'affiche au survol. La syntaxe ARIA
          // nomme les modificateurs en anglais, d'où la traduction.
          aria-keyshortcuts={window.vela.platform === 'darwin' ? 'Meta+L' : 'Control+L'}
          onChange={(event) => setDraft(event.target.value)}
          onFocus={(event) => {
            setFocused(true)
            setDraft(home ? '' : tab.url)
            requestAnimationFrame(() => event.target.select())
          }}
          onBlur={() => setFocused(false)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setFocused(false)
              event.currentTarget.blur()
            }
          }}
        />
        {!home && !focused && !hovered && (
          <span className="address-host" title={tab.url}>
            {hostOf(tab.url)}
          </span>
        )}
        {!home && (
          <button
            type="button"
            className="address-shield"
            data-empty={tab.blocked === 0}
            onClick={() => setOverlay('protection')}
            // Le compteur seul ne dit rien à voix haute : le nom accessible
            // reprend la phrase du survol.
            aria-label={
              tab.blocked > 0
                ? `${tab.blocked} requête${tab.blocked > 1 ? 's' : ''} bloquée${tab.blocked > 1 ? 's' : ''} — voir la protection de ce site`
                : 'Protection de ce site'
            }
            title={
              tab.blocked > 0
                ? `${tab.blocked} requête${tab.blocked > 1 ? 's' : ''} bloquée${tab.blocked > 1 ? 's' : ''} — voir la protection de ce site`
                : 'Protection de ce site'
            }
          >
            <Icon name="shield" size={12} />
            {tab.blocked > 0 ? tab.blocked : null}
          </button>
        )}
        {tab.agentSent && (
          <span className="address-agent-sent" title="Cette page a été envoyée au fournisseur de modèle pour l’agent">
            <Icon name="sparkles" size={12} /> Envoyée au modèle
          </span>
        )}
        {!home && (
          <span className="address-hint" role="note" aria-label={`Raccourci ${shortcut('L')} — barre d’adresse`}>
            {shortcut('L')}
          </span>
        )}
      </form>

      <div className="pane-actions">
        {!home && (
          <button
            type="button"
            className="icon-btn"
            data-active={bookmarked}
            onClick={() => void toggleBookmark(tab.id)}
            aria-pressed={bookmarked}
            title={bookmarked ? 'Retirer des marque-pages (⌘D)' : 'Garder cette page (⌘D)'}
          >
            <Icon name="star" size={16} filled={bookmarked} />
          </button>
        )}
        {secondary ? (
          <button type="button" className="icon-btn" onClick={() => splitToggle()} title="Fermer la vue scindée">
            <Icon name="close" size={16} />
          </button>
        ) : (
          <button
            type="button"
            className="icon-btn"
            onClick={() => splitToggle()}
            title={`Vue scindée (${shortcut('⇧D')})`}
          >
            <Icon name="split" size={16} />
          </button>
        )}
      </div>
    </div>
  )
}
