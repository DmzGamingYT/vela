import { useMemo, useState } from 'react'
import { logDateLabel } from '@shared/letterboxd'
import {
  LETTERBOXD_PAGES,
  letterboxdUrl,
  sanitizeWatchlist,
  type SpaceWatchItem
} from '@shared/space'
import { timeAgo } from '../lib/format'
import { useBrowser } from '../store/browser'
import { Icon } from './Icon'

/**
 * Carte « À voir » de l'accueil, propre à l'espace qui l'active.
 *
 * La liste vit dans vela.json et les liens Letterboxd ou JustWatch s'ouvrent
 * dans l'onglet, avec la session de l'espace : c'est vous qui ouvrez ces pages.
 * Seul l'import du journal sort de la machine, sur un clic et vers
 * letterboxd.com uniquement — c'est le flux `letterboxd-journal` de l'audit.
 */
export default function WatchlistCard({ spaceId }: { spaceId: string }) {
  const view = useBrowser((state) => state.view)
  const updateSpace = useBrowser((state) => state.updateSpace)
  const navigate = useBrowser((state) => state.navigate)
  const newTab = useBrowser((state) => state.newTab)
  const activeTabId = useBrowser((state) => state.view?.activeTabId)
  const [draft, setDraft] = useState('')
  const [pick, setPick] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const space = view?.spaces.find((item) => item.id === spaceId)
  const items = useMemo(() => sanitizeWatchlist(space?.watchItems), [space?.watchItems])
  if (!space) return null

  const toWatch = items.filter((item) => !item.watched)
  const watched = items.filter((item) => item.watched)
  const user = space.letterboxd ?? null
  const log = space.letterboxdLog ?? []
  const logAt = space.letterboxdLogAt ?? null

  const save = (next: SpaceWatchItem[]): void => {
    void updateSpace(space.id, { watchItems: next })
  }

  const add = (): void => {
    const title = draft.trim()
    if (!title) return
    const next = sanitizeWatchlist([...items, { title }])
    save(next)
    setDraft('')
  }

  const toggle = (item: SpaceWatchItem): void => {
    save(items.map((entry) => (entry.id === item.id ? { ...entry, watched: !entry.watched } : entry)))
    if (pick === item.id) setPick(null)
  }

  const remove = (item: SpaceWatchItem): void => {
    save(items.filter((entry) => entry.id !== item.id))
    if (pick === item.id) setPick(null)
  }

  /** Tirage « Ce soir » : un titre non vu, au hasard, annoncé poliment. */
  const draw = (): void => {
    if (toWatch.length === 0) return
    const chosen = toWatch[Math.floor(Math.random() * toWatch.length)]
    setPick(chosen.id)
  }

  const stars = (rating: number): string =>
    '★'.repeat(Math.floor(rating)) + (rating % 1 >= 0.5 ? '½' : '')

  const importLog = async (): Promise<void> => {
    setImporting(true)
    setNotice(null)
    try {
      const result = await window.vela.letterboxd.import(space.id)
      if (result.ok) {
        setNotice(
          result.count === 1
            ? '1 entrée importée.'
            : `${result.count} entrées importées.`
        )
        return
      }
      const reasons: Record<string, string> = {
        'no-profile': 'Ajoutez d’abord votre nom Letterboxd dans les réglages de l’espace.',
        'not-found': 'Profil introuvable. Vérifiez le nom dans les réglages de l’espace.',
        private: 'Ce profil est privé : son flux public n’est pas lisible.',
        empty: 'Le flux ne contient aucune entrée pour l’instant.',
        timeout: 'Letterboxd n’a pas répondu à temps. Réessayez plus tard.',
        offline: 'Réseau indisponible. Rien n’a été modifié.',
        failed: 'Letterboxd a refusé la demande. Réessayez plus tard.'
      }
      setNotice(reasons[result.reason ?? 'failed'] ?? reasons.failed)
    } catch {
      setNotice('Import impossible. Rien n’a été modifié.')
    } finally {
      setImporting(false)
    }
  }

  const picked = pick ? items.find((item) => item.id === pick) : undefined
  const open = (url: string): void => {
    if (activeTabId) navigate(activeTabId, url)
    else newTab(url)
  }

  return (
    <section className="home-card home-watch" aria-label="Liste à voir">
      <div className="home-card-head">
        <h2>À voir</h2>
        <span className="watch-score" aria-hidden="true">
          {toWatch.length}
        </span>
      </div>

      {user && (
        <div className="watch-account">
          <span className="watch-account-label">Letterboxd · {user}</span>
          <span className="watch-links">
            {LETTERBOXD_PAGES.map((page) => {
              const url = letterboxdUrl(user, page.path)
              if (!url) return null
              return (
                <button
                  key={page.id}
                  type="button"
                  className="watch-link"
                  onClick={() => open(url)}
                  title={page.label}
                >
                  {page.label}
                </button>
              )
            })}
          </span>
        </div>
      )}

      {user && (
        <div className="watch-log">
          <div className="watch-log-head">
            <span className="watch-log-heading">
              Journal{log.length > 0 ? ` · ${log.length}` : ''}
            </span>
            <button
              type="button"
              className="watch-import"
              onClick={() => void importLog()}
              disabled={importing}
              title="Lire le flux RSS public du profil letterboxd.com"
            >
              <Icon name={importing ? 'reload' : 'download'} size={11} />
              {importing ? 'Import…' : log.length > 0 ? 'Actualiser' : 'Importer'}
            </button>
          </div>

          {notice && (
            <p className="watch-log-note" role="status" aria-live="polite">
              {notice}
            </p>
          )}

          {log.length > 0 ? (
            <>
              <ul className="watch-log-list">
                {log.slice(0, 5).map((entry) => (
                  <li key={entry.id}>
                    <button
                      type="button"
                      className="watch-log-row"
                      onClick={() => {
                        if (entry.url) open(entry.url)
                      }}
                      title={`${entry.title} sur Letterboxd`}
                    >
                      <span className="watch-log-date">{logDateLabel(entry.watchedDate)}</span>
                      <span className="watch-log-name">
                        {entry.title}
                        {entry.year ? <span className="watch-log-year"> · {entry.year}</span> : null}
                      </span>
                      {entry.rating !== null && (
                        <span className="watch-log-stars" aria-label={`${entry.rating} sur 5`}>
                          {stars(entry.rating)}
                        </span>
                      )}
                      {entry.rewatch && (
                        <span className="watch-log-again" title="Revu">
                          ↻
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
              <div className="watch-log-foot">
                <span>{logAt ? `Importé ${timeAgo(logAt)}` : 'Importé'}</span>
                {log.length > 5 && (
                  <button
                    type="button"
                    className="watch-link"
                    onClick={() => {
                      const url = letterboxdUrl(user, '/films/diary/')
                      if (url) open(url)
                    }}
                  >
                    Tout le journal
                  </button>
                )}
              </div>
            </>
          ) : (
            <p className="watch-hint">
              Importez votre journal depuis le flux public de letterboxd.com : un clic, une requête,
              aucun cookie.
            </p>
          )}
        </div>
      )}

      <ul className="watch-list">
        {items.map((item) => (
          <li key={item.id} className="watch-row" data-watched={item.watched ? 'true' : undefined}>
            <button
              type="button"
              className="watch-check"
              role="checkbox"
              aria-checked={item.watched}
              aria-label={item.watched ? `Marquer ${item.title} à voir` : `Marquer ${item.title} vu`}
              onClick={() => toggle(item)}
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="m3.5 8.5 3 3 6-6" />
              </svg>
            </button>
            <span className="watch-title">{item.title}</span>
            <button
              type="button"
              className="watch-remove"
              onClick={() => remove(item)}
              title="Retirer"
              aria-label={`Retirer ${item.title}`}
            >
              <Icon name="close" size={11} />
            </button>
          </li>
        ))}
      </ul>

      {items.length === 0 && (
        <p className="watch-hint">Ajoutez un film ou une série : la liste reste sur cet appareil.</p>
      )}

      {picked ? (
        <div className="watch-pick" role="status" aria-live="polite">
          <span className="watch-pick-kicker">Ce soir</span>
          <strong>{picked.title}</strong>
          <span className="watch-pick-actions">
            <button
              type="button"
              className="watch-link"
              onClick={() =>
                open(`https://www.justwatch.com/fr/recherche?q=${encodeURIComponent(picked.title)}`)
              }
            >
              Où le voir
            </button>
            <button
              type="button"
              className="watch-link"
              onClick={() => open(`https://letterboxd.com/search/${encodeURIComponent(picked.title)}/`)}
            >
              Fiche
            </button>
          </span>
        </div>
      ) : (
        <button
          type="button"
          className="watch-draw"
          onClick={draw}
          disabled={toWatch.length === 0}
          title={toWatch.length === 0 ? 'Ajoutez d’abord un titre' : 'Tirer un titre au hasard'}
        >
          <Icon name="sparkles" size={12} />
          Ce soir
        </button>
      )}

      <div className="watch-add">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Un film, une série…"
          spellCheck={false}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            add()
          }}
          aria-label="Titre à ajouter à la liste"
        />
        <button
          type="button"
          onClick={add}
          title="Ajouter"
          aria-label="Ajouter à la liste"
          disabled={!draft.trim()}
        >
          <Icon name="plus" size={13} />
        </button>
      </div>

      {watched.length > 0 && (
        <p className="watch-foot">
          {watched.length} vu{watched.length > 1 ? 's' : ''} · {toWatch.length} à voir
        </p>
      )}
    </section>
  )
}
