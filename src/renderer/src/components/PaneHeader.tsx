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
  const setOverlay = useBrowser((state) => state.setOverlay)
  const toggleNotes = useBrowser((state) => state.toggleNotes)
  const notesOpen = useBrowser((state) => state.notesOpen)
  const agentRunning = useBrowser((state) => state.agent.status === 'running')

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
    <div className="pane-head">
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
          placeholder="Rechercher ou saisir une adresse"
          spellCheck={false}
          autoComplete="off"
          aria-label="Adresse"
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
        {tab.blocked > 0 && (
          <span className="address-shield" title={`${tab.blocked} requêtes bloquées sur cette page`}>
            <Icon name="shield" size={12} />
            {tab.blocked}
          </span>
        )}
        <span className="address-hint">{shortcut('L')}</span>
      </form>

      <div className="pane-actions">
        {primary && (
          <>
            <button
              type="button"
              className="icon-btn"
              data-active={notesOpen}
              onClick={() => toggleNotes()}
              title={`Notes (${shortcut('E')})`}
            >
              <Icon name="notes" size={16} />
            </button>
            <button
              type="button"
              className="icon-btn"
              data-active={agentRunning}
              onClick={() => setOverlay('agent')}
              title={`Agent (${shortcut('J')})`}
            >
              <Icon name="sparkles" size={16} />
            </button>
          </>
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
