import { useEffect, useState } from 'react'
import type { ProcessInfo } from '@shared/types'
import { useBrowser } from '../store/browser'
import { Icon } from './Icon'

export default function ProcessManager() {
  const setOverlay = useBrowser((s) => s.setOverlay)
  const selectTab = useBrowser((s) => s.selectTab)
  const [rows, setRows] = useState<ProcessInfo[]>([])
  const [live, setLive] = useState(0)

  const refresh = async () => {
    try {
      const res = await window.vela.processes()
      setRows(res.processes)
      setLive(res.live)
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    void refresh()
    const t = setInterval(() => void refresh(), 3000)
    return () => clearInterval(t)
  }, [])

  const discard = async (id: string | null) => {
    if (!id) return
    await window.vela.tabs.discard(id)
    void refresh()
  }

  return (
    <div className="overlay" onMouseDown={() => setOverlay(null)}>
      <div className="sheet" role="dialog" aria-label="Processus" onMouseDown={(e) => e.stopPropagation()}>
        <header className="settings-head">
          <div>
            <h1>Processus · {live} vifs</h1>
            <p>Chaque onglet non suspendu garde un renderer. Déchargez pour libérer la RAM.</p>
          </div>
          <button type="button" className="icon-btn" onClick={() => setOverlay(null)} title="Fermer"><Icon name="close" size={17} /></button>
        </header>
        <div className="settings-scroll">
          {rows.map((row) => (
            <div key={row.tabId ?? 'app'} className="setting-row">
              <div>
                <label>{row.title || row.url || 'App'}</label>
                <p className="setting-hint">{row.live ? `Vif · ${row.blocked} bloquées` : 'Suspendu · recharge au focus'} {row.url}</p>
              </div>
              {row.tabId && row.live ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="ghost-btn" onClick={() => { selectTab(row.tabId!); setOverlay(null) }}>Aller</button>
                  <button type="button" className="ghost-btn" onClick={() => void discard(row.tabId)}>Décharger</button>
                </div>
              ) : <span className="tag">{row.live ? 'App' : 'En pause'}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
