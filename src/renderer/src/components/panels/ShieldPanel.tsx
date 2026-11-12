import { useCallback, useEffect, useRef, useState } from 'react'
import { hostOf, isHomeUrl } from '@shared/url'
import {
  CATEGORY_LABEL,
  categoryTotals,
  groupHosts,
  type BlockCategory
} from '../../lib/blockCategories'
import { useModalFocus } from '../../lib/useModalFocus'
import { useBrowser } from '../../store/browser'
import { Icon } from '../Icon'

/** Le bouton du rail qui ouvre le panneau : ancre et cible du focus. */
const ANCHOR = '.reading-rail .rr-btn[aria-label="Protection de la page"]'

/**
 * Bouclier : un coup d’œil, pas une page.
 *
 * Petit panneau posé sous l’icône du rail de droite, sans voile flouté : on
 * ouvre, on lit, on referme. Il montre les requêtes arrêtées sur la page,
 * regroupées par domaine parent et étiquetées par usage ; l’interrupteur du
 * site est l’action la plus cherchée, il est donc en haut.
 */
export default function ShieldPanel() {
  const view = useBrowser((state) => state.view)
  const setOverlay = useBrowser((state) => state.setOverlay)
  const toggleSiteProtection = useBrowser((state) => state.toggleSiteProtection)
  const reload = useBrowser((state) => state.reload)
  const panelRef = useModalFocus<HTMLDivElement>({ initialFocus: 'container' })

  const [confirmHost, setConfirmHost] = useState<string | null>(null)
  const confirmTimer = useRef<number | null>(null)
  const [openParent, setOpenParent] = useState<string | null>(null)

  // Ancrage sur le bouton du rail : le panneau s’ouvre sous l’icône, pas au
  // centre de l’écran. La mesure se fait dans la ref, pendant le montage et
  // avant la peinture : pas d’état, donc pas de second rendu à l’ouverture.
  const placer = useCallback(
    (node: HTMLDivElement | null): void => {
      panelRef.current = node
      if (!node) return
      const button = document.querySelector<HTMLElement>(ANCHOR)
      if (!button) return
      const rect = button.getBoundingClientRect()
      node.style.top = `${Math.max(12, rect.top - 12)}px`
      node.style.right = `${Math.max(12, window.innerWidth - rect.left + 10)}px`
    },
    [panelRef]
  )

  // À la fermeture, le focus revient au bouclier du rail, même si le panneau
  // a été ouvert au clavier.
  useEffect(() => {
    return () => {
      document.querySelector<HTMLElement>(ANCHOR)?.focus()
    }
  }, [])

  useEffect(
    () => () => {
      if (confirmTimer.current !== null) window.clearTimeout(confirmTimer.current)
    },
    []
  )

  if (!view) return null

  const tab = view.tabs.find((item) => item.id === view.activeTabId)
  const home = !tab || isHomeUrl(tab.url)
  const host = tab ? hostOf(tab.url) : ''
  const exempt = host.length > 0 && view.privacyExemptions.includes(host)
  const hosts = tab?.blockedHosts ?? []
  const groups = groupHosts(hosts)
  const totals = categoryTotals(hosts)
  const total = tab?.blocked ?? 0
  const today = view.blockedToday
  const week = view.blockedWeek

  const confirm = (target: string): void => {
    if (confirmHost !== target) {
      setConfirmHost(target)
      if (confirmTimer.current !== null) window.clearTimeout(confirmTimer.current)
      confirmTimer.current = window.setTimeout(() => {
        setConfirmHost((current) => (current === target ? null : current))
      }, 4000)
      return
    }
    setConfirmHost(null)
    void toggleSiteProtection(target)
  }

  const chip = (category: BlockCategory | null, mixed: boolean): React.ReactElement => (
    <span className="shield-cat" data-cat={category ?? 'mixed'} title={
      category ? CATEGORY_LABEL[category] : 'Plusieurs usages'
    }>
      {category ? CATEGORY_LABEL[category] : mixed ? 'Mixte' : 'Autre'}
    </span>
  )

  return (
    <div className="shield-layer" onMouseDown={() => setOverlay(null)}>
      <div
        ref={placer}
        className="shield-pop"
        role="dialog"
        aria-modal="false"
        aria-label="Protection de la page"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="shield-pop-head">
          <div>
            <p className="eyebrow">
              <span className="eyebrow-dot" />
              Protection
            </p>
            <h2>Requêtes arrêtées</h2>
          </div>
          <button
            type="button"
            className="icon-btn shield-close"
            onClick={() => setOverlay(null)}
            title="Fermer"
            aria-label="Fermer"
          >
            <Icon name="close" size={15} />
          </button>
        </header>

        {home ? (
          <div className="shield-calm">
            <span className="shield-calm-mark" aria-hidden="true">
              <Icon name="shield" size={18} />
            </span>
            <p>Ouvrez une page pour voir les requêtes que le filtre arrête sur ce site.</p>
          </div>
        ) : (
          <div className="shield-body">
            <div className="shield-site">
              <span className="shield-site-name">
                Protection sur <b>{host}</b>
              </span>
              <button
                type="button"
                role="switch"
                className="switch"
                aria-checked={!exempt}
                aria-label={`Protection sur ${host}`}
                data-on={exempt ? undefined : 'true'}
                onClick={() => void toggleSiteProtection(host)}
              >
                <span />
              </button>
            </div>

            {total === 0 ? (
              <div className="shield-calm">
                <span className="shield-calm-mark" aria-hidden="true">
                  <Icon name="shield" size={18} />
                </span>
                <p>Aucune requête arrêtée sur cette page.</p>
              </div>
            ) : (
              <>
                {/* Trois portées, du plus proche au plus large : la page, le
                    jour, la semaine. */}
                <p className="shield-tally">
                  <b>{total}</b> sur cette page
                  <span aria-hidden="true">·</span>
                  <b>{today}</b> aujourd’hui
                  <span aria-hidden="true">·</span>
                  <b>{week}</b> cette semaine
                </p>

                <div
                  className="shield-mix"
                  role="img"
                  aria-label={`Répartition : ${totals
                    .map((entry) => `${CATEGORY_LABEL[entry.category]} ${entry.count}`)
                    .join(', ')}`}
                >
                  {totals.map((entry) => (
                    <span
                      key={entry.category}
                      data-cat={entry.category}
                      style={{ flexGrow: entry.count }}
                      title={`${CATEGORY_LABEL[entry.category]} : ${entry.count}`}
                    />
                  ))}
                </div>

                <div className="shield-rows" role="list" aria-label="Domaines arrêtés sur cette page">
                  <div className="shield-row shield-list-head" aria-hidden="true">
                    <span>Domaine</span>
                    <span>Usage</span>
                    <span className="shield-head-count">Requêtes</span>
                    <span />
                  </div>

                  {groups.map((group) => {
                    const single = group.hosts.length === 1
                    const open = openParent === group.parent
                    return (
                      <div className="shield-group" key={group.parent} role="listitem">
                        <div className="shield-row" data-head={single ? undefined : 'true'}>
                          {single ? (
                            <span className="shield-host" title={group.hosts[0].host}>
                              {group.hosts[0].host}
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="shield-parent"
                              aria-expanded={open}
                              aria-label={`${group.parent}, ${group.hosts.length} sous-domaines`}
                              onClick={() => setOpenParent(open ? null : group.parent)}
                            >
                              <Icon name={open ? 'chevron-down' : 'chevron-right'} size={12} />
                              <span className="shield-host">{group.parent}</span>
                            </button>
                          )}
                          {chip(group.category, !single)}
                          <span className="shield-count">{group.total}</span>
                          {single ? (
                            <button
                              type="button"
                              className="action shield-action"
                              data-confirming={confirmHost === group.hosts[0].host}
                              aria-label={`Autoriser ${group.hosts[0].host} sur cette page`}
                              title={`Autoriser ${group.hosts[0].host} sur cette page — la page se recharge et ses requêtes repartent`}
                              onClick={() => confirm(group.hosts[0].host)}
                            >
                              {confirmHost === group.hosts[0].host ? 'Confirmer' : 'Autoriser'}
                            </button>
                          ) : (
                            <span />
                          )}
                        </div>

                        {!single &&
                          open &&
                          group.hosts.map((entry) => (
                            <div className="shield-row" data-child="true" key={entry.host}>
                              <span className="shield-host" title={entry.host}>
                                {entry.host}
                              </span>
                              {chip(entry.category, false)}
                              <span className="shield-count">{entry.count}</span>
                              <button
                                type="button"
                                className="action shield-action"
                                data-confirming={confirmHost === entry.host}
                                aria-label={`Autoriser ${entry.host} sur cette page`}
                                title={`Autoriser ${entry.host} sur cette page — la page se recharge et ses requêtes repartent`}
                                onClick={() => confirm(entry.host)}
                              >
                                {confirmHost === entry.host ? 'Confirmer' : 'Autoriser'}
                              </button>
                            </div>
                          ))}
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            {exempt && (
              <div className="shield-banner">
                <span>
                  <Icon name="shield" size={14} />
                  Protection désactivée pour <b>{host}</b>.
                </span>
                <button
                  type="button"
                  className="action"
                  onClick={() => tab && reload(tab.id)}
                >
                  Recharger
                </button>
                <button
                  type="button"
                  className="action"
                  onClick={() => void toggleSiteProtection(host)}
                >
                  Réactiver
                </button>
              </div>
            )}

            {view.privacyExemptions.length > 0 && (
              <section className="shield-exempt" aria-label="Sites exemptés">
                <h2>Sites exemptés</h2>
                <div className="shield-rows">
                  {view.privacyExemptions.map((entry) => (
                    <div className="shield-row" key={entry}>
                      <span className="shield-host" title={entry}>
                        {entry}
                      </span>
                      <span />
                      <span />
                      <button
                        type="button"
                        className="action shield-action"
                        onClick={() => void toggleSiteProtection(entry)}
                      >
                        Réactiver
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        <footer className="shield-foot">
          <button
            type="button"
            className="shield-link"
            onClick={() => setOverlay('settings')}
          >
            Réglages de confidentialité
          </button>
          <span className="shield-foot-total">
            {view.blockedTotal.toLocaleString('fr-FR')} depuis l’ouverture
          </span>
        </footer>
      </div>
    </div>
  )
}
