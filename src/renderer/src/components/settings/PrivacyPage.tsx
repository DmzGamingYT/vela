import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { LOCAL_ONLY, NETWORK_FLOWS, type NetworkFlow } from '@shared/network'
import { readWeatherPlace } from '@shared/place'
import { HISTORY_RANGES, type HistoryRange } from '@shared/navigation'
import { isLoopbackEndpoint, providerById, providerState } from '@shared/providers'
import { engineLabel, hostOf, isHomeUrl } from '@shared/url'
import type { AgentMode, Settings } from '@shared/types'
import { plural } from '../../lib/format'
import { useBrowser } from '../../store/browser'
import { Icon } from '../Icon'
import { groupedFlows } from './privacyGroups'
import { resolveTab } from './settingsSearch'

type Tab = 'protection' | 'local' | 'permissions' | 'flows'

const TABS: { id: Tab; label: string }[] = [
  { id: 'protection', label: 'Protection' },
  { id: 'local', label: 'Données locales' },
  { id: 'permissions', label: 'Permissions' },
  { id: 'flows', label: 'Flux réseau' }
]

// L'onglet vit le temps de la session : fermer les réglages ne ramène pas à
// l'onglet Protection.
let lastTab: Tab = 'protection'

type Tone = 'on' | 'off' | 'ask' | 'local'

const TONE_LABEL: Record<Tone, string> = {
  on: 'Actif',
  off: 'Inactif',
  ask: 'Sur demande',
  local: 'Local'
}

const TONE_ICON: Record<Tone, 'check' | 'close' | 'history' | 'lock'> = {
  on: 'check',
  off: 'close',
  ask: 'history',
  local: 'lock'
}

const FLOW_GROUPS = groupedFlows()

/** État réel d'un flux : le même calcul que la page d'audit, sans le réécrire. */
function stateOf(
  flow: NetworkFlow,
  context: {
    place: string | null
    engine: string
    agentMode: AgentMode
    providerReady: boolean
    providerLabel: string
    providerLocal: boolean
    providerLoopback: boolean
    tabs: number
    letterboxd: string
  }
): Tone {
  switch (flow.id) {
    case 'meteo-ville':
    case 'meteo-releve':
      return context.place ? 'on' : 'off'
    case 'moteur-connexion':
    case 'moteur-recherche':
      return 'on'
    case 'tunnel-fournisseurs':
    case 'tunnel-pages':
    case 'bd-ocr':
      return 'ask'
    case 'modeles':
      if (context.agentMode !== 'api' || !context.providerReady) return 'off'
      return context.providerLocal && context.providerLoopback ? 'local' : 'on'
    case 'modele-local':
      if (context.agentMode !== 'api' || !context.providerLocal) return 'off'
      return context.providerLoopback ? 'local' : 'ask'
    case 'mises-a-jour':
    case 'favicons':
    case 'pages':
      return 'on'
    case 'letterboxd-journal':
      return context.letterboxd ? 'ask' : 'off'
    default:
      return 'ask'
  }
}

export default function PrivacyPage({
  settings,
  onOpenNavigation,
  initialTab
}: {
  settings: Settings
  onOpenNavigation: () => void
  initialTab?: string
}) {
  const view = useBrowser((state) => state.view)
  const updateSettings = useBrowser((state) => state.updateSettings)
  const toggleSiteProtection = useBrowser((state) => state.toggleSiteProtection)
  const toast = useBrowser((state) => state.toast)
  const [tab, setTab] = useState<Tab>(() => resolveTab(initialTab, TABS, lastTab))
  const tabRefs = useRef(new Map<Tab, HTMLButtonElement | null>())
  const [thumbs, setThumbs] = useState<number | null>(null)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [filter, setFilter] = useState<'all' | Tone>('all')
  const [query, setQuery] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [range, setRange] = useState<HistoryRange>('hour')
  const [undo, setUndo] = useState<{ count: number; pending: boolean } | null>(null)
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    lastTab = tab
  }, [tab])

  useEffect(() => {
    void window.vela.thumbs
      .count()
      .then(setThumbs)
      .catch(() => setThumbs(0))
  }, [])

  if (!view) return null
  const enabled = settings.blockTrackers
  const level: 'off' | 'trackers' | 'strict' = !enabled
    ? 'off'
    : settings.blockLevel === 'strict'
      ? 'strict'
      : 'trackers'
  const activeTab = view.tabs.find((item) => item.id === view.activeTabId)
  // L'accueil n'est pas un site : aucune exception à proposer dessus.
  const pageHost = activeTab && !isHomeUrl(activeTab.url) ? hostOf(activeTab.url) : ''
  const exempt = (host: string): boolean =>
    view.privacyExemptions.some((entry) => host === entry || host.endsWith(`.${entry}`))
  const domains = new Set(view.tabs.flatMap((entry) => entry.blockedHosts.map((item) => item.host)))
    .size
  const protectedTabs = view.tabs.filter((entry) => {
    const owner = view.spaces.find((item) => item.id === entry.spaceId)
    return settings.blockTrackers && owner?.blockTrackers !== false && owner?.private !== true
  }).length

  const space = view.spaces.find((item) => item.id === view.activeSpaceId)
  const provider = providerById(settings.agent.provider)
  const providerStatus = providerState(settings)
  const context = {
    place: readWeatherPlace()?.name ?? null,
    engine: engineLabel(
      settings.searchEngine,
      settings.customEngines.find((entry) => entry.id === settings.customEngineId)?.name
    ),
    agentMode: settings.agent.mode,
    providerReady: Boolean(providerStatus.hasKey || provider.local),
    providerLabel: provider.label,
    providerLocal: Boolean(provider.local),
    providerLoopback: isLoopbackEndpoint(providerStatus.baseUrl),
    tabs: view.tabs.length,
    letterboxd: space?.letterboxd ?? ''
  }

  const rows = NETWORK_FLOWS.map((flow) => ({ flow, tone: stateOf(flow, context) }))
  const counts = {
    on: rows.filter((row) => row.tone === 'on').length,
    ask: rows.filter((row) => row.tone === 'ask').length,
    off: rows.filter((row) => row.tone === 'off').length,
    local: rows.filter((row) => row.tone === 'local').length
  }

  const visible = rows.filter(({ flow, tone }) => {
    if (filter !== 'all' && tone !== filter) return false
    const needle = query.trim().toLowerCase()
    if (!needle) return true
    return `${flow.label} ${flow.target} ${flow.trigger} ${flow.data}`
      .toLowerCase()
      .includes(needle)
  })

  const chooseTab = (next: Tab): void => {
    setTab(next)
    tabRefs.current.get(next)?.focus()
  }

  const tabKeys = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const moves: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      Home: 0,
      End: TABS.length - 1
    }
    if (!(event.key in moves)) return
    event.preventDefault()
    const next = (index + moves[event.key] + TABS.length) % TABS.length
    chooseTab(TABS[next].id)
  }

  const flowText = (): string =>
    rows
      .map(
        ({ flow, tone }) =>
          `- ${flow.label} — ${TONE_LABEL[tone]} — ${flow.target}\n  Déclencheur : ${flow.trigger}\n  Envoyé : ${flow.data}${flow.off ? `\n  Pour l’éviter : ${flow.off}` : ''}`
      )
      .join('\n')

  const copy = async (text: string, message: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text)
      toast(message)
    } catch {
      toast('Copie impossible.', 'error')
    }
  }

  const exportMarkdown = async (): Promise<void> => {
    const markdown = [
      `# Flux réseau de Vela`,
      '',
      `${rows.length} flux · ${counts.on} actifs · ${counts.ask} sur demande · ${counts.off} inactifs`,
      '',
      flowText()
    ].join('\n')
    await copy(markdown, 'Liste copiée en Markdown.')
  }

  const clearData = async (): Promise<void> => {
    const removed = await window.vela.history.clearRange(range).catch(() => 0)
    setConfirming(false)
    if (undoTimer.current) clearTimeout(undoTimer.current)
    // Vignettes et icônes ne sont pas réversibles : elles partent seulement si
    // l'annulation n'est pas demandée.
    undoTimer.current = setTimeout(() => {
      void window.vela.thumbs
        .purge()
        .then(() => setThumbs(0))
        .catch(() => undefined)
      void window.vela.favicons.purge().catch(() => undefined)
      setUndo(null)
    }, 8000)
    setUndo({ count: removed, pending: true })
    toast(
      removed > 0
        ? plural(removed, 'entrée retirée', 'entrées retirées')
        : 'Aucune entrée sur cette période.'
    )
  }

  const undoClear = async (): Promise<void> => {
    if (undoTimer.current) clearTimeout(undoTimer.current)
    undoTimer.current = null
    const restored = await window.vela.history.undo().catch(() => 0)
    setUndo(null)
    toast(
      restored > 0 ? plural(restored, 'entrée rétablie', 'entrées rétablies') : 'Rien à rétablir.'
    )
  }

  const purgeThumbsNow = async (): Promise<void> => {
    // Un refus de l'IPC laissait le compteur figé et une rejection non gérée
    // dans la console : le nettoyage reste un geste muet.
    const removed = await window.vela.thumbs.purge().catch(() => 0)
    setThumbs(0)
    toast(
      removed > 0
        ? plural(removed, 'vignette retirée', 'vignettes retirées')
        : 'Aucune vignette à retirer.'
    )
  }

  return (
    <div className="privacy-page">
      <header className="privacy-head">
        <p className="privacy-lede">
          Ce qui reste local, ce qui sort — et ce qui est arrêté avant de partir.
        </p>
        <div className="privacy-chips">
          <span>
            <Icon name="check" size={11} /> Aucun compte
          </span>
          <span>
            <Icon name="check" size={11} /> Aucune synchronisation
          </span>
          <span>
            <Icon name="check" size={11} /> Aucune mesure d’usage
          </span>
        </div>
        <button type="button" className="privacy-summary" onClick={() => setTab('flows')}>
          <strong>{rows.length} flux</strong>
          <span>{counts.on} actifs</span>
          <span>{counts.ask} sur demande</span>
          <span>{counts.off} inactifs</span>
          <Icon name="external" size={12} />
        </button>
      </header>

      <div className="privacy-tabs" role="tablist" aria-label="Sections de la confidentialité">
        {TABS.map((entry, index) => (
          <button
            key={entry.id}
            ref={(node) => {
              if (node) tabRefs.current.set(entry.id, node)
              else tabRefs.current.delete(entry.id)
            }}
            type="button"
            role="tab"
            id={`privacy-tab-${entry.id}`}
            aria-selected={tab === entry.id}
            aria-controls={`privacy-panel-${entry.id}`}
            tabIndex={tab === entry.id ? 0 : -1}
            className="privacy-tab"
            data-active={tab === entry.id}
            onClick={() => setTab(entry.id)}
            onKeyDown={(event) => tabKeys(event, index)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === 'protection' && (
        <div
          role="tabpanel"
          id="privacy-panel-protection"
          aria-labelledby="privacy-tab-protection"
          className="privacy-panel"
        >
          <div
            className="privacy-levels"
            role="radiogroup"
            aria-label="Niveau de blocage"
            data-settings-anchor="privacy-levels"
          >
            {[
              {
                id: 'off' as const,
                label: 'Aucun',
                detail: 'Rien n’est filtré.',
                risk: 'Publicités, traqueurs et contenus tiers passent.'
              },
              {
                id: 'trackers' as const,
                label: 'Traqueurs',
                detail: 'Publicités et mesure d’audience.',
                risk: 'Page cassée : rare.',
                recommended: true
              },
              {
                id: 'strict' as const,
                label: 'Renforcé',
                detail: 'En plus : scripts et cadres d’un autre site.',
                risk: 'Page cassée : possible sur les lecteurs intégrés.'
              }
            ].map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="radio"
                aria-checked={level === entry.id}
                className="privacy-level"
                data-active={level === entry.id}
                onClick={() => {
                  if (entry.id === 'off') void updateSettings({ blockTrackers: false })
                  else void updateSettings({ blockTrackers: true, blockLevel: entry.id })
                }}
              >
                <span className="privacy-level-head">
                  <strong>{entry.label}</strong>
                  {entry.recommended && <em>Recommandé</em>}
                </span>
                <span className="privacy-level-detail">{entry.detail}</span>
                <span className="privacy-level-risk">{entry.risk}</span>
                {level === entry.id && (
                  <span className="privacy-level-check">
                    <Icon name="check" size={13} />
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="privacy-stats" role="group" aria-label="Compteurs de la session">
            {[
              {
                value: view.blockedTotal,
                label: 'Requêtes bloquées',
                hint: 'Requêtes arrêtées depuis le lancement.'
              },
              {
                value: domains,
                label: 'Sites concernés',
                hint: 'Domaines distincts qui ont tenté une requête bloquée.'
              },
              {
                value: protectedTabs,
                label: 'Onglets protégés',
                hint: 'Onglets ouverts dont la session applique le filtre.'
              }
            ].map((stat) => (
              <div key={stat.label} title={stat.hint}>
                <span className="privacy-stat-value">{stat.value}</span>
                <span className="privacy-stat-label">{stat.label}</span>
                <span className="privacy-stat-hint">{stat.hint}</span>
              </div>
            ))}
          </div>

          <div className="setting-row">
            <div>
              <label>Liste de blocage</label>
              <p className="setting-hint">
                Embarquée dans l’application et mise à jour avec chaque version : aucun abonnement
                distant.
              </p>
            </div>
            <span className="tag">Locale</span>
          </div>

          <div className="privacy-subhead" data-settings-anchor="privacy-exceptions">
            <h3>Exceptions par site</h3>
            <p>Un site exempté garde ses publicités et ses traqueurs.</p>
          </div>
          {pageHost && (
            <div className="setting-row">
              <div>
                <label>{pageHost}</label>
                <p className="setting-hint">
                  {exempt(pageHost)
                    ? 'Blocage désactivé pour ce site.'
                    : 'Blocage actif sur ce site.'}
                </p>
              </div>
              <button
                type="button"
                className="action"
                onClick={() => void toggleSiteProtection(pageHost)}
              >
                {exempt(pageHost) ? 'Réactiver le blocage' : 'Désactiver pour ce site'}
              </button>
            </div>
          )}
          {view.privacyExemptions.length === 0 ? (
            <p className="setting-hint">Aucun site exempté.</p>
          ) : (
            <ul className="privacy-exemptions">
              {view.privacyExemptions.map((host) => (
                <li key={host}>
                  <code>{host}</code>
                  <button
                    type="button"
                    className="tab-action"
                    onClick={() => void toggleSiteProtection(host)}
                    title={`Retirer ${host}`}
                  >
                    <Icon name="trash" size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'local' && (
        <div
          role="tabpanel"
          id="privacy-panel-local"
          aria-labelledby="privacy-tab-local"
          className="privacy-panel"
        >
          <div className="setting-row">
            <div>
              <label htmlFor="thumbnails">Vignettes des pages récentes</label>
              <p
                className="setting-hint"
                title="Capture réduite prise à la fermeture de l’onglet, gardée dans le dossier de données."
              >
                Une capture par onglet fermé ; rien pour un espace privé.
                {thumbs !== null ? ` ${plural(thumbs, 'vignette', 'vignettes')}.` : ''}
              </p>
            </div>
            <div className="setting-actions">
              <button
                id="thumbnails"
                type="button"
                className="switch"
                role="switch"
                aria-checked={settings.thumbnails}
                data-on={settings.thumbnails}
                aria-label="Vignettes des pages récentes"
                onClick={() => {
                  void updateSettings({ thumbnails: !settings.thumbnails })
                  void window.vela.thumbs
                    .count()
                    .then(setThumbs)
                    .catch(() => undefined)
                }}
              >
                <span />
              </button>
              <span className="switch-state" data-on={settings.thumbnails}>
                {settings.thumbnails ? 'Activé' : 'Désactivé'}
              </span>
              <button type="button" className="action" onClick={() => void purgeThumbsNow()}>
                <Icon name="trash" size={13} /> Vider
              </button>
            </div>
          </div>

          <div className="setting-row" data-settings-anchor="privacy-favicons">
            <div>
              <label>Icônes de sites</label>
              <p
                className="setting-hint"
                title="Une requête par domaine, gardée sept jours sur l’appareil."
              >
                Une requête par domaine, gardée sept jours.
              </p>
            </div>
            <button
              type="button"
              className="action"
              onClick={async () => {
                const count = await window.vela.favicons.purge().catch(() => 0)
                toast(
                  count > 0
                    ? plural(count, 'icône retirée', 'icônes retirées')
                    : 'Le cache est déjà vide.'
                )
              }}
            >
              <Icon name="trash" size={13} /> Vider le cache
            </button>
          </div>

          <div className="setting-row" data-settings-anchor="privacy-history">
            <div>
              <label>Historique</label>
              <p className="setting-hint">
                Durée, consultation et effacement se règlent dans Navigation.
              </p>
            </div>
            <button type="button" className="action" onClick={onOpenNavigation}>
              <Icon name="history" size={13} /> Ouvrir Navigation
            </button>
          </div>

          <div className="setting-row" data-settings-anchor="privacy-cookies">
            <div>
              <label>Cookies et stockage des sites</label>
              <p className="setting-hint">
                Isolés par espace : {plural(view.spaces.length, 'partition', 'partitions')}{' '}
                distinctes. Rien n’est partagé entre elles.
              </p>
            </div>
            <span className="tag">{plural(view.spaces.length, 'espace', 'espaces')}</span>
          </div>

          <div className="privacy-subhead" data-settings-anchor="privacy-clear">
            <h3>Effacer des données</h3>
            <p>
              L’historique part tout de suite ; vignettes et icônes suivent après huit secondes.
            </p>
          </div>
          {!confirming ? (
            <button type="button" className="action danger" onClick={() => setConfirming(true)}>
              <Icon name="trash" size={13} /> Effacer des données
            </button>
          ) : (
            <div className="privacy-confirm" role="group" aria-label="Confirmer l’effacement">
              <label>
                <span>Période</span>
                <select
                  value={range}
                  onChange={(event) => setRange(event.target.value as HistoryRange)}
                >
                  {HISTORY_RANGES.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.label}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="action danger" onClick={() => void clearData()}>
                Effacer définitivement
              </button>
              <button type="button" className="action ghost" onClick={() => setConfirming(false)}>
                Annuler
              </button>
            </div>
          )}
          {undo && (
            <div className="privacy-undo" role="status" aria-live="polite">
              <span>
                {plural(undo.count, 'entrée effacée', 'entrées effacées')}. Vignettes et icônes
                partiront à la fin du délai.
              </span>
              <button type="button" className="link-btn" onClick={() => void undoClear()}>
                Rétablir
              </button>
            </div>
          )}

          <ul className="privacy-local-list">
            {LOCAL_ONLY.map((item) => (
              <li key={item}>
                <Icon name="check" size={12} /> {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === 'permissions' && (
        <div
          role="tabpanel"
          id="privacy-panel-permissions"
          aria-labelledby="privacy-tab-permissions"
          className="privacy-panel"
        >
          <p className="setting-hint">
            Aucune page n’obtient caméra, micro, position ni notifications : Vela refuse par défaut,
            sans demande.
          </p>
          {[
            { label: 'Caméra', detail: 'Refusée à chaque demande de page.' },
            { label: 'Micro', detail: 'Refusé, y compris pour les pages de réunion.' },
            {
              label: 'Position',
              detail: 'Refusée ; l’accueil utilise la ville que vous saisissez.'
            },
            {
              label: 'Notifications',
              detail: 'Refusées ; aucune notification de site ne s’affiche.'
            }
          ].map((permission) => (
            <div key={permission.label} className="setting-row">
              <div>
                <label>{permission.label}</label>
                <p className="setting-hint">{permission.detail}</p>
              </div>
              <span className="tag">Refusée par défaut</span>
            </div>
          ))}
          <p className="setting-hint">
            Aucune exception par site n’existe : il n’y a donc rien à lister ni à réinitialiser.
          </p>
        </div>
      )}

      {tab === 'flows' && (
        <div
          role="tabpanel"
          id="privacy-panel-flows"
          aria-labelledby="privacy-tab-flows"
          className="privacy-panel"
        >
          <div className="privacy-flow-tools">
            <div className="privacy-filters" role="group" aria-label="Filtrer les flux">
              {[
                { id: 'all' as const, label: 'Tous' },
                { id: 'on' as const, label: 'Actifs' },
                { id: 'ask' as const, label: 'Sur demande' },
                { id: 'off' as const, label: 'Inactifs' }
              ].map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className="segment"
                  data-active={filter === entry.id}
                  aria-pressed={filter === entry.id}
                  onClick={() => setFilter(entry.id)}
                >
                  {entry.label}
                </button>
              ))}
            </div>
            <input
              className="privacy-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Chercher un flux"
              aria-label="Chercher un flux"
              spellCheck={false}
            />
            <button
              type="button"
              className="action"
              onClick={() => void copy(flowText(), 'Liste des flux copiée.')}
            >
              Copier la liste
            </button>
            <button type="button" className="action" onClick={() => void exportMarkdown()}>
              Exporter en Markdown
            </button>
          </div>

          <p className="setting-hint" role="status">
            {visible.length} flux affichés sur {rows.length}. Même source que l’audit : rien n’est
            masqué.
          </p>

          {FLOW_GROUPS.map((group) => {
            const items = visible.filter((row) =>
              group.flows.some((flow) => flow.id === row.flow.id)
            )
            if (items.length === 0) return null
            return (
              <section key={group.id} className="privacy-group">
                <h3>{group.label}</h3>
                <ul>
                  {items.map(({ flow, tone }) => {
                    const expanded = open[flow.id] === true
                    return (
                      <li key={flow.id} className="privacy-flow" data-tone={tone}>
                        <button
                          type="button"
                          className="privacy-flow-head"
                          aria-expanded={expanded}
                          aria-controls={`flow-${flow.id}`}
                          onClick={() =>
                            setOpen((current) => ({ ...current, [flow.id]: !expanded }))
                          }
                        >
                          <span className="privacy-flow-name">{flow.label}</span>
                          <span className="privacy-flow-state" data-tone={tone}>
                            <Icon name={TONE_ICON[tone]} size={11} /> {TONE_LABEL[tone]}
                          </span>
                          <span className="privacy-flow-target" title={flow.target}>
                            {flow.target}
                          </span>
                          <span className="privacy-flow-trigger">{flow.trigger}</span>
                          <Icon name={expanded ? 'close' : 'plus'} size={12} />
                        </button>
                        {expanded && (
                          <div className="privacy-flow-body" id={`flow-${flow.id}`}>
                            <p>
                              <strong>Ce qui est envoyé.</strong> {flow.data}
                            </p>
                            <p>
                              <strong>Pour l’éviter.</strong>{' '}
                              {flow.off ?? 'Aucun réglage ne coupe ce flux pour l’instant.'}
                            </p>
                            {flow.hosts.length > 0 && (
                              <div className="privacy-flow-address">
                                <code>{flow.hosts.join(' · ')}</code>
                                <button
                                  type="button"
                                  className="action ghost"
                                  onClick={() =>
                                    void copy(flow.hosts.join(', '), 'Adresse copiée.')
                                  }
                                >
                                  Copier
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
