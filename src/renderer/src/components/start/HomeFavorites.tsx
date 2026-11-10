import { useState } from 'react'
import { hostOf } from '@shared/url'
import { shortcut } from '../../lib/format'
import { useBrowser } from '../../store/browser'
import Favicon from '../Favicon'
import { Icon } from '../Icon'

const COLLAPSED_KEY = 'vela.home.favorites.collapsed'
const VISIBLE_FAVORITES = 11

/**
 * Rangée de favoris de l'accueil. Elle lit les marque-pages de l'appareil,
 * dans leur ordre, et renvoie vers la liste complète quand il y en a trop.
 */
export default function HomeFavorites({ spaceId }: { spaceId: string }) {
  const view = useBrowser((state) => state.view)
  const newTab = useBrowser((state) => state.newTab)
  const setOverlay = useBrowser((state) => state.setOverlay)
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSED_KEY) === '1'
    } catch {
      return false
    }
  })

  if (!view) return null

  const bookmarks = view.bookmarks.filter((entry) => /^https?:/i.test(entry.url))
  const visible = bookmarks.slice(0, VISIBLE_FAVORITES)
  const hidden = bookmarks.length - visible.length
  const empty = bookmarks.length === 0
  const countLabel = `${bookmarks.length} favori${bookmarks.length > 1 ? 's' : ''}`

  const toggleCollapsed = (): void => {
    setCollapsed((previous) => {
      const next = !previous
      try {
        localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0')
      } catch {
        /* stockage indisponible : le choix vaut pour la session */
      }
      return next
    })
  }

  return (
    <section
      className="home-pins home-favorites"
      data-empty={empty ? 'true' : undefined}
      aria-label="Favoris"
    >
      <div className="home-pins-head">
        <div className="home-pins-title">
          <h2>
            Favoris
            {empty ? null : <span className="home-pins-count">{countLabel}</span>}
          </h2>
          {empty ? (
            // L'aide suit son titre : à l'autre bout de la ligne, elle ne se
            // lisait plus comme une explication de « Favoris ».
            <p className="home-favorites-empty">
              Gardez une page avec {shortcut('D')} : elle apparaîtra ici.
            </p>
          ) : null}
        </div>
        {empty ? null : (
          <div className="home-pins-actions">
            <button
              type="button"
              className="home-card-action"
              onClick={() => setOverlay('bookmarks')}
              title="Ouvrir tous les favoris"
            >
              <span>Tous</span>
              <Icon name="arrow-right" size={12} />
            </button>
            <button
              type="button"
              className="pins-toggle"
              data-collapsed={collapsed ? 'true' : undefined}
              aria-expanded={!collapsed}
              onClick={toggleCollapsed}
              title={collapsed ? 'Déplier les favoris' : 'Replier les favoris'}
            >
              <Icon name="forward" size={13} />
            </button>
          </div>
        )}
      </div>

      {!collapsed && !empty ? (
        <div className="pin-grid" role="list" aria-label="Favoris">
          {visible.map((bookmark) => {
            const host = hostOf(bookmark.url)
            const title = bookmark.title.trim() || host
            return (
              <div key={bookmark.id} className="pin-card" role="listitem">
                <button
                  type="button"
                  className="pin-open"
                  onClick={() => newTab(bookmark.url)}
                  title={`${title} — ${host}`}
                >
                  <span className="pin-icon">
                    <Favicon
                      src={bookmark.favicon}
                      url={bookmark.url}
                      label={title}
                      size={20}
                      spaceId={spaceId}
                    />
                  </span>
                  <span className="pin-copy">
                    <strong>{title}</strong>
                    <small>{host}</small>
                  </span>
                </button>
              </div>
            )
          })}
          {/* Un « + » ferme toujours la rangée : il ouvre la liste complète
              et sert aussi d'emplacement pour un nouveau favori. */}
          <button
            type="button"
            className="pin-add"
            onClick={() => setOverlay('bookmarks')}
            title={
              hidden > 0
                ? `Ajouter ou voir les ${hidden} autres favoris`
                : 'Ajouter un favori'
            }
            aria-label="Ajouter un favori"
          >
            <span aria-hidden="true">+</span>
          </button>
        </div>
      ) : null}
    </section>
  )
}
