import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { MouseEvent as ReactMouseEvent } from 'react'
import type { TabView } from '@shared/types'
import { isHomeUrl, prettyUrl } from '@shared/url'
import { displayTitle } from '@shared/url'
import { useBrowser } from '../store/browser'
import { Icon } from './Icon'

interface TabPreviewCardProps {
  tab: TabView
  anchorRect: DOMRect
  onClose: () => void
  onMouseEnter: () => void
  onMouseLeave: () => void
}

const WIDTH = 260

export default function TabPreviewCard({ tab, anchorRect, onClose, onMouseEnter, onMouseLeave }: TabPreviewCardProps) {
  const newTab = useBrowser((state) => state.newTab)
  const selectTab = useBrowser((state) => state.selectTab)
  const [broken, setBroken] = useState(false)
  const [thumb, setThumb] = useState<string | null>(null)

  const home = isHomeUrl(tab.url)

  // Vraie vignette de la page quand le cache en a une ; sinon la carte reste
  // compacte, sans cadre média. Un favicon agrandi ne fait pas un aperçu.
  useEffect(() => {
    if (home) {
      setThumb(null)
      return
    }
    let alive = true
    void window.vela.thumbs
      .get(tab.url)
      .then((dataUrl) => {
        if (alive) setThumb(dataUrl ?? null)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [home, tab.url])

  const openTab = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    event.preventDefault()
    newTab(tab.url)
    onClose()
  }

  const goToTab = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    event.preventDefault()
    selectTab(tab.id)
    onClose()
  }

  useEffect(() => {
    const handlePointerDown = (event: globalThis.MouseEvent) => {
      const target = event.target as HTMLElement | null
      const within = target?.closest('[data-close="true"], [data-action="open"], [data-action="go"]') === null
      if (!within) return
      const card = target.closest('.tab-preview-card')
      const rect = card ? (card as HTMLElement).getBoundingClientRect() : anchorRect
      const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom
      if (inside) return
      onClose()
    }
    window.addEventListener('pointerdown', handlePointerDown, true)
    return () => window.removeEventListener('pointerdown', handlePointerDown, true)
  }, [anchorRect, onClose])

  const sounding = tab.audible && !tab.muted
  const shield = tab.blocked > 0 || tab.blockedHosts.length > 0
  // Hauteur estimée selon la présence de la vignette : la carte ne doit pas
  // sortir par le bas de la fenêtre.
  const height = thumb ? 232 : 116
  // Les pages vivent dans des vues natives, au-dessus du rendu de la coque :
  // une carte posée sur la page serait invisible. Elle reste dans la barre
  // latérale et, si la place le permet, sous la liste d'onglets pour ne pas
  // recouvrir les lignes qu'on survole ensuite.
  const sidebar = document.querySelector('.sidebar')?.getBoundingClientRect()
  const rows = Array.from(document.querySelectorAll<HTMLElement>('.sidebar .tab-row'))
  const listBottom = rows.reduce((bottom, row) => Math.max(bottom, row.getBoundingClientRect().bottom), 0)
  const pageLeft = sidebar ? sidebar.right : window.innerWidth
  const fitsBelow = Boolean(sidebar && listBottom > 0 && listBottom + height + 16 <= sidebar.bottom)
  const left = sidebar
    ? Math.max(sidebar.left + 8, Math.min(anchorRect.right + 12, pageLeft - WIDTH - 8))
    : Math.max(8, Math.min(anchorRect.right + 12, window.innerWidth - WIDTH - 12))
  const top = fitsBelow
    ? listBottom + 8
    : Math.max(8, Math.min(anchorRect.top, window.innerHeight - height - 12))

  // Portail : la barre latérale porte un fond filtré, qui rognait la carte
  // flottante à son bord droit. Posée sur le corps, elle s'affiche entière.
  return createPortal(
    <div
      className="tab-preview-card"
      style={{
        left,
        top,
        width: WIDTH
      }}
      role="group"
      aria-label={`Aperçu de ${home ? 'l’accueil' : displayTitle(tab.title)}`}
      data-home={home ? 'true' : undefined}
      data-compact={thumb ? undefined : 'true'}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={(event) => event.stopPropagation()}
    >
      {thumb && (
        <div className="preview-media">
          <img className="preview-image" src={thumb} alt="" draggable={false} />
        </div>
      )}

      <div className="preview-body">
        <div className="preview-header">
          <span className="preview-favicon">
            {tab.favicon && !broken ? (
              <img src={tab.favicon} alt="" onError={() => setBroken(true)} draggable={false} />
            ) : (
              <Icon name={home ? 'circle' : 'globe'} size={12} />
            )}
          </span>
          <span className="preview-title">{home ? 'Accueil' : displayTitle(tab.title)}</span>
        </div>

        {/* Une seule ligne d'adresse : le domaine y figure déjà. */}
        {!home && <p className="preview-url">{prettyUrl(tab.url)}</p>}

        {(sounding || tab.muted || tab.asleep || shield) && (
          <div className="preview-badges">
            {(sounding || tab.muted) && (
              <span className="preview-badge audio" data-muted={tab.muted ? 'true' : undefined}>
                <Icon name={tab.muted ? 'volume-off' : 'volume'} size={9} />
                {tab.muted ? 'Silence' : 'Son'}
              </span>
            )}
            {tab.asleep && !home && <span className="preview-badge asleep">Veille</span>}
            {shield && <span className="preview-badge shield">Bouclier</span>}
          </div>
        )}

        <div className="preview-actions">
          <button type="button" className="preview-btn" data-action="go" onClick={goToTab}>
            <Icon name="arrow-right" size={11} />
            Ouvrir
          </button>
          <button type="button" className="preview-btn" data-action="open" onClick={openTab}>
            <Icon name="external" size={11} />
            Dupliquer
          </button>
          <button type="button" className="preview-btn close" data-close="true" onClick={onClose} aria-label="Fermer l’aperçu">
            <Icon name="close" size={11} />
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
