import { useState } from 'react'
import type { FormEvent } from 'react'
import { isHomeUrl } from '@shared/url'
import { weekdayLabel } from '../lib/format'
import { listSessions, removeSession, saveSession, type SavedSession } from '../lib/sessions'
import { useModalFocus } from '../lib/useModalFocus'
import { useBrowser } from '../store/browser'
import Favicon from './Favicon'
import { Icon } from './Icon'

export default function SessionsPanel() {
  const view = useBrowser((state) => state.view)
  const setOverlay = useBrowser((state) => state.setOverlay)
  const activateSpace = useBrowser((state) => state.activateSpace)
  const sheetRef = useModalFocus<HTMLDivElement>()
  const [sessions, setSessions] = useState<SavedSession[]>(listSessions)
  const [name, setName] = useState('')
  const [notice, setNotice] = useState('')
  const [today] = useState(() => Date.now())

  if (!view) return null

  const space = view.spaces.find((item) => item.id === view.activeSpaceId)
  const openTabs = view.tabs.filter(
    (tab) => tab.spaceId === view.activeSpaceId && !isHomeUrl(tab.url) && /^https?:/i.test(tab.url)
  )
  const savedPages = sessions.reduce((total, session) => total + session.tabs.length, 0)

  const save = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (!space || openTabs.length === 0) {
      setNotice('Ouvrez au moins une page dans cet espace avant d’enregistrer une session.')
      return
    }
    const next = saveSession({
      name: name.trim() || `Session du ${weekdayLabel(today)}`,
      spaceId: space.id,
      spaceName: space.name,
      tabs: openTabs.map((tab) => ({ url: tab.url, title: tab.title }))
    })
    setSessions(next)
    setName('')
    setNotice('Session enregistrée sur cet appareil.')
  }

  const restore = async (session: SavedSession): Promise<void> => {
    const target = view.spaces.some((item) => item.id === session.spaceId)
      ? session.spaceId
      : view.activeSpaceId
    setOverlay(null)
    activateSpace(target)
    for (const tab of session.tabs) {
      await window.vela.tabs
        .create({ spaceId: target, url: tab.url, activate: false })
        .catch(() => null)
    }
  }

  const remove = (session: SavedSession): void => {
    setSessions(removeSession(session.id))
    setNotice(`« ${session.name} » supprimée.`)
  }

  return (
    <div className="overlay" onMouseDown={() => setOverlay(null)}>
      <div
        ref={sheetRef}
        className="sheet sessions-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Sessions"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="sheet-head">
          <div>
            <p className="eyebrow">
              <span className="eyebrow-dot" />
              {weekdayLabel(today)}
            </p>
            <h1>Sessions</h1>
            <p className="sheet-lede">
              Gardez un ensemble d’onglets pour le rouvrir en un clic. Tout reste sur cet appareil.
            </p>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setOverlay(null)}
            title="Fermer"
          >
            <Icon name="close" size={18} />
          </button>
        </header>

        <div className="sessions-stats">
          <div>
            <strong>{openTabs.length}</strong>
            <span>onglets ouverts</span>
          </div>
          <div>
            <strong>{sessions.length}</strong>
            <span>sessions gardées</span>
          </div>
          <div>
            <strong>{savedPages}</strong>
            <span>pages sauvegardées</span>
          </div>
        </div>

        <form className="sessions-save" onSubmit={save}>
          <label className="sessions-name">
            <span className="sr-only">Nom de la session</span>
            <input
              value={name}
              maxLength={80}
              placeholder={`Session du ${weekdayLabel(today)}`}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <button type="submit" className="action primary" disabled={openTabs.length === 0}>
            <Icon name="plus" size={14} />
            Enregistrer la session
          </button>
        </form>

        <div className="sessions-list">
          {sessions.length === 0 ? (
            <p className="sessions-empty">
              Aucune session gardée. Ouvrez quelques pages, puis enregistrez-les ici pour les
              retrouver ensemble plus tard.
            </p>
          ) : (
            sessions.map((session) => (
              <div className="sessions-row" key={session.id}>
                <div className="sessions-icons" aria-hidden="true">
                  {session.tabs.slice(0, 4).map((tab) => (
                    <span key={tab.url} className="sessions-icon">
                      <Favicon url={tab.url} label={tab.title} size={16} />
                    </span>
                  ))}
                  {session.tabs.length > 4 ? (
                    <span className="sessions-more">+{session.tabs.length - 4}</span>
                  ) : null}
                </div>
                <div className="sessions-copy">
                  <strong>{session.name}</strong>
                  <span>
                    {session.tabs.length} page{session.tabs.length > 1 ? 's' : ''} ·{' '}
                    {session.spaceName} · {weekdayLabel(session.createdAt)}
                  </span>
                </div>
                <div className="sessions-actions">
                  <button type="button" className="action" onClick={() => void restore(session)}>
                    Ouvrir
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => remove(session)}
                    title={`Supprimer ${session.name}`}
                    aria-label={`Supprimer ${session.name}`}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <footer className="sheet-foot">
          <span className="foot-note">
            <Icon name="shield" size={13} />
            Les sessions restent dans le stockage local de Vela.
          </span>
          <span className="sessions-notice" role="status" aria-live="polite">
            {notice}
          </span>
        </footer>
      </div>
    </div>
  )
}
