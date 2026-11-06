import { useState } from 'react'
import { hostOf } from '@shared/url'
import { useBrowser } from '../store/browser'
import Favicon from './Favicon'
import { Icon } from './Icon'

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
        <h2>
          Favoris
          {empty ? null : <span className="home-pins-count">{countLabel}</span>}
        </h2>
        {empty ? (
          // Une ligne, pas un bloc : sur un profil neuf, un panneau vide de
          // trois lignes pesait autant qu'un module actif.
          <p className="home-favorites-empty">
            Ouvrez une page, puis utilisez l’étoile de la barre d’adresse.
          </p>
        ) : (
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
                        size={30}
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
            {hidden > 0 && (
              <button
                type="button"
                className="pin-add"
                onClick={() => setOverlay('bookmarks')}
                title={`Voir les ${hidden} autres favoris`}
              >
                <span aria-hidden="true">+{hidden}</span>
                <span className="sr-only">Voir les {hidden} autres favoris</span>
              </button>
            )}
        </div>
      ) : null}
    </section>
  )
}
