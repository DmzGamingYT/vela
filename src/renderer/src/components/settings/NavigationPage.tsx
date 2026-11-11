import { useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import {
  HISTORY_RANGES,
  HISTORY_RETENTIONS,
  MAX_CUSTOM_ENGINES,
  MAX_KEYWORDS,
  WEB_LANGUAGES,
  type HistoryRange,
  ZOOM_LEVELS,
  customEngineId,
  describeZoom,
  sanitizeEngineName,
  sanitizeEngineTemplate,
  sanitizeStartupUrl
} from '@shared/navigation'
import type { CustomSearchEngine, SearchKeyword, Settings } from '@shared/types'
import { BUILTIN_ENGINES, SEARCH_ENGINES, searchUrl } from '@shared/url'
import type { SettingsPatch } from '@shared/api'
import { ENGINE_LOOK } from '../../lib/engines'
import { plural, shortcut } from '../../lib/format'
import { useBrowser } from '../../store/browser'
import { BrandMark, ENGINE_BRANDS } from '../BrandMark'
import { Icon } from '../Icon'
import RadioCards from '../RadioCards'
import ZoomSitesList from './ZoomSitesList'
import { resolveTab } from './settingsSearch'

interface Props {
  settings: Settings
  updateSettings: (patch: SettingsPatch) => Promise<void> | void
  bookmarkCount: number
  historyCount: number
  downloadCount: number
  onOpenPrivacy: () => void
  initialTab?: string
}

type Tab = 'search' | 'startup' | 'library' | 'downloads' | 'web'

const TABS: { id: Tab; label: string }[] = [
  { id: 'search', label: 'Recherche' },
  { id: 'startup', label: 'Démarrage' },
  { id: 'library', label: 'Bibliothèque' },
  { id: 'downloads', label: 'Téléchargements' },
  { id: 'web', label: 'Pages web' }
]

/** Hôte lisible d'un modèle d'adresse : « searx.example.org », sans chemin. */
function templateHost(template: string): string {
  try {
    return new URL(template.replace('%s', 'test')).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

function EngineGrid({
  settings,
  onPick
}: {
  settings: Settings
  onPick: (engine: Settings['searchEngine'], customId: string) => void
}) {
  const refs = useRef(new Map<string, HTMLButtonElement | null>())
  const tiles = useMemo(
    () => [
      ...BUILTIN_ENGINES.map((id) => ({
        key: id as string,
        engine: id as Settings['searchEngine'],
        customId: '',
        name: SEARCH_ENGINES[id].label,
        host: ENGINE_LOOK[id].host,
        tint: ENGINE_LOOK[id].tint,
        brand: ENGINE_BRANDS[id]
      })),
      ...settings.customEngines.map((entry) => ({
        key: entry.id,
        engine: 'custom' as const,
        customId: entry.id,
        name: entry.name,
        host: templateHost(entry.template),
        tint: '#8b8578',
        brand: null
      }))
    ],
    [settings.customEngines]
  )

  const activeIndex = Math.max(
    0,
    tiles.findIndex((tile) =>
      tile.engine === 'custom'
        ? settings.searchEngine === 'custom' && tile.customId === settings.customEngineId
        : settings.searchEngine === tile.engine
    )
  )
  // Une seule rangée par défaut, quatre par rangée dans l'ancienne grille
  // compacte : ici la grille est celle des réglages, quatre colonnes.
  const columns = 4

  const move = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const steps: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: columns,
      ArrowUp: -columns
    }
    let next: number | null = null
    if (event.key in steps) next = (index + steps[event.key] + tiles.length) % tiles.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = tiles.length - 1
    if (next === null) return
    event.preventDefault()
    const tile = tiles[next]
    refs.current.get(tile.key)?.focus()
    onPick(tile.engine, tile.customId)
  }

  return (
    <div
      className="engine-grid"
      role="radiogroup"
      aria-label="Moteur de recherche"
      data-settings-anchor="nav-engine"
    >
      {tiles.map((tile, index) => {
        const active = index === activeIndex
        return (
          <button
            key={tile.key}
            ref={(node) => {
              if (node) refs.current.set(tile.key, node)
              else refs.current.delete(tile.key)
            }}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`${tile.name}, ${tile.host}`}
            tabIndex={active ? 0 : -1}
            className="engine-tile"
            data-active={active}
            data-custom={tile.engine === 'custom' ? 'true' : undefined}
            style={{ '--tint': tile.tint } as CSSProperties}
            onClick={() => onPick(tile.engine, tile.customId)}
            onKeyDown={(event) => move(event, index)}
          >
            <span className="engine-mark" aria-hidden="true">
              {tile.brand ? (
                <BrandMark brand={tile.brand} size={20} />
              ) : (
                <span>{tile.name.slice(0, 1)}</span>
              )}
            </span>
            <span className="engine-copy">
              <span className="engine-label">{tile.name}</span>
              <span className="engine-host">{tile.host}</span>
            </span>
            {active && (
              <span className="engine-check">
                <Icon name="check" size={13} />
              </span>
            )}
            {active && <span className="engine-default">Par défaut</span>}
          </button>
        )
      })}
    </div>
  )
}

export default function NavigationPage({
  settings,
  updateSettings,
  bookmarkCount,
  historyCount,
  downloadCount,
  onOpenPrivacy,
  initialTab
}: Props) {
  const setOverlay = useBrowser((state) => state.setOverlay)
  const toast = useBrowser((state) => state.toast)

  const [draftName, setDraftName] = useState('')
  const [draftTemplate, setDraftTemplate] = useState('')
  const [draftError, setDraftError] = useState('')
  const [showImporter, setShowImporter] = useState(false)
  const [detected, setDetected] = useState<
    { id: string; label: string; count: number; urls: { title: string; url: string }[] }[] | null
  >(null)
  const [confirming, setConfirming] = useState(false)
  const [range, setRange] = useState<HistoryRange>('hour')
  const [undo, setUndo] = useState<number | null>(null)
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [startupDraft, setStartupDraft] = useState(settings.startupUrl)
  const [tab, setTab] = useState<Tab>(() => resolveTab(initialTab, TABS, 'search'))
  const tabRefs = useRef(new Map<Tab, HTMLButtonElement | null>())

  const chooseTab = (next: Tab): void => {
    setTab(next)
    tabRefs.current.get(next)?.focus()
  }

  const tabKeys = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const steps: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1 }
    let next: number | null = null
    if (event.key in steps) next = (index + steps[event.key] + TABS.length) % TABS.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = TABS.length - 1
    if (next === null) return
    event.preventDefault()
    chooseTab(TABS[next].id)
  }

  const save = (patch: SettingsPatch): void => {
    void updateSettings(patch)
  }

  const addEngine = (): void => {
    const name = sanitizeEngineName(draftName)
    const template = sanitizeEngineTemplate(draftTemplate)
    if (!name) {
      setDraftError('Donnez un nom au moteur.')
      return
    }
    if (!template) {
      setDraftError(
        'L’adresse doit commencer par https:// et contenir un seul %s à la place de la recherche.'
      )
      return
    }
    const id = customEngineId(
      name,
      settings.customEngines.map((engine) => engine.id)
    )
    const customEngines: CustomSearchEngine[] = [...settings.customEngines, { id, name, template }]
    save({ customEngines, searchEngine: 'custom', customEngineId: id })
    setDraftName('')
    setDraftTemplate('')
    setDraftError('')
    toast('Moteur ajouté.')
  }

  const removeEngine = (id: string): void => {
    const customEngines = settings.customEngines.filter((engine) => engine.id !== id)
    save({ customEngines })
    toast('Moteur retiré.')
  }

  const setKeyword = (index: number, patch: Partial<SearchKeyword>): void => {
    const next = settings.searchKeywords.map((entry, position) =>
      position === index ? { ...entry, ...patch } : entry
    )
    save({ searchKeywords: next })
  }

  const addKeyword = (): void => {
    if (settings.searchKeywords.length >= MAX_KEYWORDS) return
    save({
      searchKeywords: [
        ...settings.searchKeywords,
        {
          keyword: '',
          engineId:
            settings.searchEngine === 'custom' ? settings.customEngineId : settings.searchEngine
        }
      ]
    })
  }

  const openImporter = async (): Promise<void> => {
    setShowImporter(true)
    if (detected) return
    const sources = await window.vela.bookmarks.detect().catch(() => [])
    setDetected(sources)
  }

  const importFrom = async (source: {
    label: string
    urls: { title: string; url: string }[]
  }): Promise<void> => {
    const added = await window.vela.bookmarks.addMany(source.urls)
    toast(
      added > 0
        ? plural(added, 'marque-page importé', 'marque-pages importés')
        : 'Aucun nouveau marque-page.'
    )
    setShowImporter(false)
  }

  const importFile = async (): Promise<void> => {
    const result = await window.vela.bookmarks
      .importHtml()
      .catch(() => ({ added: 0, cancelled: true }))
    if (result.cancelled) return
    toast(
      result.added > 0
        ? plural(result.added, 'marque-page importé', 'marque-pages importés')
        : 'Aucun nouveau marque-page.'
    )
    setShowImporter(false)
  }

  const exportFile = async (): Promise<void> => {
    const path = await window.vela.bookmarks.exportHtml().catch(() => null)
    if (!path) return
    toast('Marque-pages exportés.')
  }

  const clearHistory = async (): Promise<void> => {
    const removed = await window.vela.history.clearRange(range).catch(() => 0)
    setConfirming(false)
    if (removed === 0) {
      toast('Rien à effacer sur cette période.')
      return
    }
    if (undoTimer.current) clearTimeout(undoTimer.current)
    setUndo(removed)
    undoTimer.current = setTimeout(() => setUndo(null), 8000)
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

  const pickDownloadDir = async (): Promise<void> => {
    const dir = await window.vela.downloads.pickDir().catch(() => null)
    if (dir) save({ downloadDir: dir })
  }

  const startupValue =
    settings.startupBehavior === 'url' && !sanitizeStartupUrl(startupDraft)
      ? 'restore'
      : settings.startupBehavior

  return (
    <div className="navigation-page">
      <div className="navigation-tabs" role="tablist" aria-label="Sous-sections de la navigation">
        {TABS.map((entry, index) => {
          const active = tab === entry.id
          return (
            <button
              key={entry.id}
              ref={(node) => {
                if (node) tabRefs.current.set(entry.id, node)
                else tabRefs.current.delete(entry.id)
              }}
              type="button"
              role="tab"
              id={`navigation-tab-${entry.id}`}
              aria-selected={active}
              aria-controls={`navigation-panel-${entry.id}`}
              tabIndex={active ? 0 : -1}
              className="navigation-tab"
              data-active={active}
              onClick={() => setTab(entry.id)}
              onKeyDown={(event) => tabKeys(event, index)}
            >
              {entry.label}
            </button>
          )
        })}
      </div>

      <div
        className="navigation-panel"
        role="tabpanel"
        id="navigation-panel-search"
        aria-labelledby="navigation-tab-search"
        hidden={tab !== 'search'}
      >
        <section className="setting-block" aria-labelledby="nav-search">
          <div className="setting-head">
            <h2 id="nav-search">Recherche</h2>
            <p>Le moteur qui reçoit vos mots, et ce que vous tapez dans la barre d’adresse.</p>
          </div>
          <EngineGrid
            settings={settings}
            onPick={(engine, customId) =>
              save({ searchEngine: engine, customEngineId: customId || settings.customEngineId })
            }
          />

          {settings.searchEngine === 'searxng' && (
            <label className="field nav-field">
              <span>Adresse de l’instance SearXNG</span>
              <input
                key={settings.searxInstance}
                defaultValue={settings.searxInstance}
                placeholder="searx.be"
                spellCheck={false}
                autoComplete="off"
                onBlur={(event) => {
                  const value = event.target.value.trim()
                  save({ searxInstance: value })
                  toast(`SearXNG : ${value || 'searx.be'}.`)
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return
                  event.preventDefault()
                  event.currentTarget.blur()
                }}
              />
              <small className="setting-hint">
                L’instance qui reçoit vos recherches. Vide : searx.be.
              </small>
            </label>
          )}

          <div className="nav-subhead" data-settings-anchor="nav-custom-engines">
            <h3>Moteurs ajoutés</h3>
            <p>
              Un nom et une adresse de recherche contenant %s, en https uniquement.
              {settings.customEngines.length >= MAX_CUSTOM_ENGINES ? ' Douze au maximum.' : ''}
            </p>
          </div>

          {settings.customEngines.length > 0 && (
            <ul className="nav-list">
              {settings.customEngines.map((engine) => (
                <li key={engine.id} className="nav-list-row">
                  <span className="nav-list-copy">
                    <strong>{engine.name}</strong>
                    <span>{templateHost(engine.template)}</span>
                  </span>
                  <span className="nav-list-preview">
                    {searchUrl('verre', 'custom', '', engine.template)}
                  </span>
                  <button
                    type="button"
                    className="tab-action"
                    title={`Retirer ${engine.name}`}
                    onClick={() => removeEngine(engine.id)}
                  >
                    <Icon name="trash" size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="nav-add-grid">
            <label className="field">
              <span>Nom</span>
              <input
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                placeholder="Exemple : Mon moteur"
                maxLength={40}
                spellCheck={false}
              />
            </label>
            <label className="field">
              <span>Adresse de recherche</span>
              <input
                value={draftTemplate}
                onChange={(event) => setDraftTemplate(event.target.value)}
                placeholder="Adresse complète avec %s"
                spellCheck={false}
                autoComplete="off"
              />
            </label>
            <button type="button" className="action" onClick={addEngine}>
              <Icon name="plus" size={13} /> Ajouter un moteur
            </button>
          </div>
          {draftError && (
            <p className="nav-error" role="alert">
              <Icon name="warning" size={12} /> {draftError}
            </p>
          )}

          <div className="nav-subhead" data-settings-anchor="nav-keywords">
            <h3>Mots-clés rapides</h3>
            <p>
              Un mot puis un espace dans la barre d’adresse : «{' '}
              {settings.searchKeywords[0]?.keyword ?? 'g'} verre » cherche sur ce moteur.
            </p>
          </div>
          <ul className="nav-list">
            {settings.searchKeywords.map((entry, index) => (
              // La clé ne dépend pas du mot-clé : il change à chaque frappe, et
              // React remonterait alors le champ — le curseur perdrait le focus
              // au premier caractère. La liste ne se réordonne pas, l'index
              // suffit.
              <li key={index} className="nav-list-row">
                <input
                  className="nav-keyword"
                  value={entry.keyword}
                  aria-label={`Mot-clé ${index + 1}`}
                  maxLength={12}
                  spellCheck={false}
                  onChange={(event) =>
                    setKeyword(index, {
                      keyword: event.target.value.toLowerCase().replace(/[^a-z0-9]/g, '')
                    })
                  }
                />
                <span className="nav-keyword-arrow" aria-hidden="true">
                  →
                </span>
                <select
                  className="nav-select"
                  value={entry.engineId}
                  aria-label={`Moteur du mot-clé ${entry.keyword || index + 1}`}
                  onChange={(event) => setKeyword(index, { engineId: event.target.value })}
                >
                  <optgroup label="Moteurs">
                    {BUILTIN_ENGINES.map((id) => (
                      <option key={id} value={id}>
                        {SEARCH_ENGINES[id].label}
                      </option>
                    ))}
                  </optgroup>
                  {settings.customEngines.length > 0 && (
                    <optgroup label="Moteurs ajoutés">
                      {settings.customEngines.map((engine) => (
                        <option key={engine.id} value={engine.id}>
                          {engine.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
                <button
                  type="button"
                  className="tab-action"
                  title="Retirer ce mot-clé"
                  onClick={() =>
                    save({
                      searchKeywords: settings.searchKeywords.filter(
                        (_, position) => position !== index
                      )
                    })
                  }
                >
                  <Icon name="close" size={12} />
                </button>
              </li>
            ))}
          </ul>
          {settings.searchKeywords.length < MAX_KEYWORDS && (
            <button type="button" className="action" onClick={addKeyword}>
              <Icon name="plus" size={13} /> Ajouter un mot-clé
            </button>
          )}

          <p className="nav-audit">
            Vos recherches partent vers le moteur choisi, pas vers un serveur Vela.{' '}
            <button type="button" className="link-btn" onClick={onOpenPrivacy}>
              Ce qui reste local, ce qui sort
            </button>
          </p>
        </section>
      </div>

      <div
        className="navigation-panel"
        role="tabpanel"
        id="navigation-panel-startup"
        aria-labelledby="navigation-tab-startup"
        hidden={tab !== 'startup'}
      >
        <section className="setting-block" aria-labelledby="nav-startup">
          <div className="setting-head">
            <h2 id="nav-startup">Démarrage et onglets</h2>
            <p>Ce que Vela ouvre au lancement, et ce qu’il fait d’un nouvel onglet.</p>
          </div>

          <div className="appearance-field">
            <span className="appearance-field-label" id="startup-label">
              À l’ouverture
            </span>
            <RadioCards
              ariaLabel="À l’ouverture"
              value={startupValue}
              variant="segment"
              options={[
                { value: 'restore', label: 'Reprendre', hint: 'Vos onglets tels quels' },
                { value: 'home', label: 'Accueil', hint: 'Un seul onglet d’accueil' },
                { value: 'url', label: 'Page précise', hint: 'Une adresse choisie' }
              ]}
              onChange={(value) => {
                if (value === 'url') {
                  save({ startupBehavior: 'url', startupUrl: startupDraft })
                  return
                }
                save({ startupBehavior: value })
              }}
            />
          </div>

          {settings.startupBehavior === 'url' && (
            <label className="field nav-field">
              <span>Page de démarrage</span>
              <input
                value={startupDraft}
                onChange={(event) => setStartupDraft(event.target.value)}
                onBlur={() => {
                  const clean = sanitizeStartupUrl(startupDraft)
                  setStartupDraft(clean)
                  save({ startupUrl: clean })
                  if (!clean) toast('Adresse refusée : il faut une page https.', 'error')
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return
                  event.preventDefault()
                  event.currentTarget.blur()
                }}
                placeholder="Adresse de la page"
                spellCheck={false}
                inputMode="url"
              />
              <small className="setting-hint">
                Adresse https uniquement ; la page s’ouvre au lancement.
              </small>
            </label>
          )}

          <div className="appearance-field">
            <span className="appearance-field-label" id="newtab-label">
              Nouvel onglet
            </span>
            <RadioCards
              ariaLabel="Nouvel onglet"
              value={settings.newTabBlank ? 'blank' : 'home'}
              variant="segment"
              options={[
                { value: 'home', label: 'Accueil' },
                { value: 'blank', label: 'Page vide' }
              ]}
              onChange={(value) => save({ newTabBlank: value === 'blank' })}
            />
          </div>

          <div className="setting-row">
            <div>
              <label>Liens externes</label>
              <p className="setting-hint">
                Un lien cliqué s’ouvre dans un nouvel onglet du profil actif.
              </p>
            </div>
            <span className="tag">Nouvel onglet</span>
          </div>
        </section>
      </div>

      <div
        className="navigation-panel"
        role="tabpanel"
        id="navigation-panel-library"
        aria-labelledby="navigation-tab-library"
        hidden={tab !== 'library'}
      >
        <section className="setting-block" aria-labelledby="nav-bookmarks">
          <div className="setting-head">
            <h2 id="nav-bookmarks">Marque-pages</h2>
            <p>
              {plural(bookmarkCount, 'page gardée', 'pages gardées')} sur cet appareil, jamais
              synchronisée.
            </p>
          </div>
          <div className="setting-row">
            <div>
              <label>Vos pages gardées</label>
              <p className="setting-hint">
                <kbd className="key">{shortcut('D')}</kbd> garde la page affichée,{' '}
                <kbd className="key">{shortcut('⇧O')}</kbd> ouvre la liste.
              </p>
            </div>
            <div className="setting-actions">
              <button type="button" className="action" onClick={() => setOverlay('bookmarks')}>
                <Icon name="star" size={14} /> Gérer
              </button>
              <button type="button" className="action" onClick={() => void openImporter()}>
                <Icon name="download" size={13} /> Importer
              </button>
              <button type="button" className="action" onClick={() => void exportFile()}>
                <Icon name="external" size={13} /> Exporter
              </button>
            </div>
          </div>

          {showImporter && (
            <div className="nav-importer">
              <p className="setting-hint">
                Reprenez les favoris d’un navigateur installé, ou un fichier HTML.
              </p>
              {detected === null && <p className="setting-hint">Lecture locale…</p>}
              {detected !== null && detected.length === 0 && (
                <p className="setting-hint">Aucun navigateur détecté sur cet appareil.</p>
              )}
              <div className="nav-importer-actions">
                {(detected ?? []).map((source) => (
                  <button
                    key={source.id}
                    type="button"
                    className="action"
                    onClick={() => void importFrom(source)}
                  >
                    {source.label} · {source.count}
                  </button>
                ))}
                <button type="button" className="action" onClick={() => void importFile()}>
                  Fichier HTML…
                </button>
                <button
                  type="button"
                  className="action ghost"
                  onClick={() => setShowImporter(false)}
                >
                  Annuler
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="setting-block" aria-labelledby="nav-history">
          <div className="setting-head">
            <h2 id="nav-history">Historique</h2>
            <p>
              {plural(historyCount, 'entrée conservée', 'entrées conservées')} sur cet appareil.
            </p>
          </div>

          <div className="appearance-field">
            <span className="appearance-field-label" id="retention-label">
              Durée de conservation
            </span>
            <RadioCards
              ariaLabel="Durée de conservation de l’historique"
              value={settings.historyRetention}
              variant="segment"
              options={HISTORY_RETENTIONS.map((entry) => ({
                value: entry.id,
                label: entry.label,
                hint: entry.detail
              }))}
              onChange={(value) => save({ historyRetention: value })}
            />
          </div>
          <p className="setting-hint nav-hint">
            La purge se fait au lancement : au-delà de la durée choisie, les entrées partent.
          </p>

          <div className="setting-row">
            <div>
              <label>Consulter</label>
              <p className="setting-hint">Par jour, avec suppression entrée par entrée.</p>
            </div>
            <button type="button" className="action" onClick={() => setOverlay('history')}>
              <Icon name="history" size={14} /> Consulter
            </button>
          </div>

          <div className="setting-row setting-row-top">
            <div>
              <label>Effacer</label>
              <p className="setting-hint">
                Les suggestions repartent à zéro. Annulation possible huit secondes.
              </p>
            </div>
            {!confirming ? (
              <button type="button" className="action danger" onClick={() => setConfirming(true)}>
                <Icon name="trash" size={13} /> Effacer
              </button>
            ) : (
              <div className="nav-confirm" role="group" aria-label="Confirmer l’effacement">
                <label className="nav-confirm-range">
                  <span>Période</span>
                  <select
                    className="nav-select"
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
                <button type="button" className="action danger" onClick={() => void clearHistory()}>
                  Effacer définitivement
                </button>
                <button type="button" className="action ghost" onClick={() => setConfirming(false)}>
                  Annuler
                </button>
              </div>
            )}
          </div>

          {undo !== null && (
            <div className="nav-undo" role="status">
              <span>{plural(undo, 'entrée effacée', 'entrées effacées')}.</span>
              <button type="button" className="link-btn" onClick={() => void undoClear()}>
                Rétablir
              </button>
            </div>
          )}
        </section>
      </div>

      <div
        className="navigation-panel"
        role="tabpanel"
        id="navigation-panel-downloads"
        aria-labelledby="navigation-tab-downloads"
        hidden={tab !== 'downloads'}
      >
        <section className="setting-block" aria-labelledby="nav-downloads">
          <div className="setting-head">
            <h2 id="nav-downloads">Téléchargements</h2>
            <p>
              {downloadCount > 0
                ? plural(downloadCount, 'fichier cette session', 'fichiers cette session')
                : 'Aucun fichier cette session'}{' '}
              · rien n’est envoyé ailleurs.
            </p>
          </div>

          <div className="setting-row" data-settings-anchor="download-folder">
            <div>
              <label>Dossier de destination</label>
              <p className="setting-hint">
                {settings.downloadDir ?? 'Dossier Téléchargements du système'}
              </p>
            </div>
            <div className="setting-actions">
              <button type="button" className="action" onClick={() => void pickDownloadDir()}>
                <Icon name="folder" size={13} /> Choisir
              </button>
              {settings.downloadDir && (
                <button
                  type="button"
                  className="action ghost"
                  onClick={() => save({ downloadDir: null })}
                >
                  Par défaut
                </button>
              )}
            </div>
          </div>

          <div className="setting-row">
            <div>
              <label htmlFor="ask-download">Demander où enregistrer</label>
              <p className="setting-hint">Une boîte système à chaque fichier.</p>
            </div>
            <button
              id="ask-download"
              type="button"
              className="switch"
              role="switch"
              aria-checked={settings.askDownloadLocation}
              data-on={settings.askDownloadLocation}
              aria-label="Demander où enregistrer"
              onClick={() => save({ askDownloadLocation: !settings.askDownloadLocation })}
            >
              <span />
            </button>
          </div>

          <div className="setting-row">
            <div>
              <label htmlFor="open-download">Ouvrir après le téléchargement</label>
              <p className="setting-hint">
                Le fichier s’ouvre dans l’app associée, une fois complet.
              </p>
            </div>
            <button
              id="open-download"
              type="button"
              className="switch"
              role="switch"
              aria-checked={settings.openAfterDownload}
              data-on={settings.openAfterDownload}
              aria-label="Ouvrir après le téléchargement"
              onClick={() => save({ openAfterDownload: !settings.openAfterDownload })}
            >
              <span />
            </button>
          </div>

          <div className="setting-row">
            <div>
              <label>Liste des téléchargements</label>
              <p className="setting-hint">Les trente derniers fichiers, avec leur état.</p>
            </div>
            <button type="button" className="action" onClick={() => setOverlay('downloads')}>
              <Icon name="download" size={13} /> Voir la liste
            </button>
          </div>
        </section>
      </div>

      <div
        className="navigation-panel"
        role="tabpanel"
        id="navigation-panel-web"
        aria-labelledby="navigation-tab-web"
        hidden={tab !== 'web'}
      >
        <section className="setting-block" aria-labelledby="nav-web">
          <div className="setting-head">
            <h2 id="nav-web">Pages web</h2>
            <p>La langue annoncée aux sites, et la taille d’affichage de départ.</p>
          </div>

          <div className="setting-row">
            <div>
              <label htmlFor="web-language">Langue préférée</label>
              <p className="setting-hint">Envoyée dans l’en-tête Accept-Language de chaque page.</p>
            </div>
            <select
              id="web-language"
              className="nav-select"
              value={settings.webLanguage}
              onChange={(event) => save({ webLanguage: event.target.value })}
            >
              {WEB_LANGUAGES.map((language) => (
                <option key={language.id} value={language.id}>
                  {language.label}
                </option>
              ))}
            </select>
          </div>

          <div className="setting-row">
            <div>
              <label htmlFor="default-zoom">Zoom par défaut</label>
              <p className="setting-hint">
                Appliqué à l’ouverture d’une page ; ⌘0 revient à 100 %.
              </p>
            </div>
            <select
              id="default-zoom"
              className="nav-select"
              value={String(settings.defaultZoom)}
              onChange={(event) => save({ defaultZoom: Number(event.target.value) })}
            >
              {ZOOM_LEVELS.map((level) => (
                <option key={level} value={String(level)}>
                  {describeZoom(level)}
                </option>
              ))}
            </select>
          </div>

          <ZoomSitesList />
        </section>
      </div>
    </div>
  )
}
