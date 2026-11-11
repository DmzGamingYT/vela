import { useEffect, useState } from 'react'
import type { ProcessInfo } from '@shared/types'
import { isHomeUrl } from '@shared/url'
import { useModalFocus } from '../../lib/useModalFocus'
import { useBrowser } from '../../store/browser'
import { Icon } from '../Icon'

/** « aucune requête bloquée », « 1 requête bloquée », « 3 requêtes bloquées ». */
function blockedLabel(count: number): string {
  if (count === 0) return 'aucune requête bloquée'
  return `${count} requête${count > 1 ? 's' : ''} bloquée${count > 1 ? 's' : ''}`
}

/** Nom de la ligne : l'accueil garde son nom, jamais son titre d'onglet. */
function rowLabel(row: ProcessInfo): string {
  if (row.type === 'app') return 'Vela'
  if (isHomeUrl(row.url)) return 'Accueil'
  return row.title || row.url || 'Onglet'
}

export default function ProcessManager() {
  const setOverlay = useBrowser((s) => s.setOverlay)
  const selectTab = useBrowser((s) => s.selectTab)
  const [rows, setRows] = useState<ProcessInfo[]>([])
  const [live, setLive] = useState(0)
  const sheetRef = useModalFocus<HTMLDivElement>()

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
    // Hors du corps de l'effet : `refresh` écrit l'état en revenant.
    queueMicrotask(() => void refresh())
    const t = setInterval(() => void refresh(), 3000)
    return () => clearInterval(t)
  }, [])

  const discard = async (id: string | null) => {
    if (!id) return
    await window.vela.tabs.discard(id)
    void refresh()
  }

  // Le compteur ne compte que les onglets vivants — l'application a toujours
  // la sienne — et la phrase s'accorde avec zéro, un ou plusieurs.
  const liveLabel =
    live === 0
      ? 'aucun onglet vif'
      : `${live} onglet${live > 1 ? 's' : ''} vif${live > 1 ? 's' : ''}`

  return (
    <div className="overlay" onMouseDown={() => setOverlay(null)}>
      <div
        ref={sheetRef}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Processus"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="settings-head">
          <div>
            <h2>Processus · {liveLabel}</h2>
            <p>Chaque onglet non suspendu garde un renderer. Déchargez pour libérer la RAM.</p>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setOverlay(null)}
            title="Fermer"
          >
            <Icon name="close" size={17} />
          </button>
        </header>
        <div className="settings-scroll">
          {rows.map((row) => (
            <div key={row.tabId ?? 'app'} className="setting-row">
              <div>
                <label>{rowLabel(row)}</label>
                <p className="setting-hint">
                  {row.type === 'app'
                    ? `Application · ${blockedLabel(row.blocked)}`
                    : row.live
                      ? `Vif · ${blockedLabel(row.blocked)}`
                      : 'Suspendu · recharge à l’ouverture'}
                  {row.url && !isHomeUrl(row.url) ? ` · ${row.url}` : ''}
                </p>
              </div>
              <div className="process-actions">
                {row.memoryMb !== null && (
                  <span className="process-mem" title="Mémoire vive du processus">
                    {Math.round(row.memoryMb)} Mo
                  </span>
                )}
                {row.tabId && row.live ? (
                  <>
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() => {
                        selectTab(row.tabId!)
                        setOverlay(null)
                      }}
                    >
                      Aller
                    </button>
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() => void discard(row.tabId)}
                    >
                      Décharger
                    </button>
                  </>
                ) : (
                  <span className="tag">{row.type === 'app' ? 'App' : 'En pause'}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
