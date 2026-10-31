import { useEffect, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import type { TabView } from '@shared/types'
import { hostOf, isHomeUrl, prettyUrl } from '@shared/url'
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

export default function TabPreviewCard({ tab, anchorRect, onClose, onMouseEnter, onMouseLeave }: TabPreviewCardProps) {
  const newTab = useBrowser((state) => state.newTab)
  const selectTab = useBrowser((state) => state.selectTab)
  const [broken, setBroken] = useState(false)

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

  const host = hostOf(tab.url)
  const home = isHomeUrl(tab.url)
  const sounding = tab.audible && !tab.muted
  const shield = tab.blocked > 0 || tab.blockedHosts.length > 0

  return (
    <div
      className="tab-preview-card"
      style={{ left: Math.min(anchorRect.right + 12, window.innerWidth - 272), top: Math.min(anchorRect.top, window.innerHeight - 230) }}
      role="group"
      aria-label={`Aperçu de ${home ? 'l’accueil' : displayTitle(tab.title)}`}
      data-home={home ? 'true' : undefined}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="preview-media">
        {tab.favicon && !broken ? (
          <img className="preview-image" src={tab.favicon} alt="" onError={() => setBroken(true)} draggable={false} />
        ) : (
          <div className="preview-placeholder">
            <Icon name={home ? 'circle' : 'image'} size={34} />
          </div>
        )}
        {(sounding || tab.muted) && (
          <span className="preview-badge audio" data-muted={tab.muted ? 'true' : undefined}>
            <Icon name={tab.muted ? 'volume-off' : 'volume'} size={9} />
            {tab.muted ? 'Silence' : 'Son'}
          </span>
        )}
        {tab.asleep && !home && (
          <span className="preview-badge asleep">Veille</span>
        )}
        {shield && (
          <span className="preview-badge shield">Bouclier</span>
        )}
      </div>

      <div className="preview-body">
        <div className="preview-header">
          <span className="preview-title">{home ? 'Accueil' : displayTitle(tab.title)}</span>
        </div>
        {!home && (
          <p className="preview-url">{prettyUrl(tab.url)}</p>
        )}
        {host && !home && <span className="preview-host">{host}</span>}

        <div className="preview-actions">
          <button type="button" className="preview-btn" data-action="open" onClick={openTab}>
            <Icon name="external" size={11} />
            Nouvel onglet
          </button>
          {tab.id && (
            <button type="button" className="preview-btn" data-action="go" onClick={goToTab}>
              <Icon name="arrow-right" size={11} />
              Ouvrir
            </button>
          )}
          <button type="button" className="preview-btn close" data-close="true" onClick={onClose}>
            <Icon name="close" size={11} />
          </button>
        </div>
      </div>
    </div>
  )
}
