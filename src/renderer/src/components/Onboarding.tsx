import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { THEME_PRESETS } from '@shared/theme'
import { SEARCH_ENGINES, searxBase } from '@shared/url'
import type { BookmarkImportSource, SearchEngineId } from '@shared/types'
import { useBrowser } from '../store/browser'
import { Icon, type IconName } from './Icon'

interface Step {
  kicker: string
  title: string
  lede: string
  icon: IconName
}

const STEPS: Step[] = [
  { kicker: 'Moteur', title: 'Votre web, à votre façon.', lede: 'Vos recherches ne vont qu’au moteur que vous choisissez.', icon: 'search' },
  { kicker: 'Essentiels', title: 'Vos habitués, en un clic.', lede: 'Épinglés dans l’espace, chargés seulement à l’ouverture.', icon: 'folder' },
  { kicker: 'Raccourcis', title: 'Tout à une touche.', lede: 'Onglets, notes, agent : sans quitter la page.', icon: 'command' },
  { kicker: 'Agent', title: 'Déléguez le fastidieux.', lede: 'Il lit les onglets que vous choisissez, vous relisez.', icon: 'sparkles' },
  { kicker: 'Couleur', title: 'Une teinte à vous.', lede: 'Tout le châssis la reprend. Les sites visités gardent leurs couleurs.', icon: 'sun' },
  { kicker: 'Prêt', title: 'Vous êtes chez vous.', lede: 'Ce qui est déjà en place sur cet appareil.', icon: 'shield' }
]

const ENGINE_LOOK: Record<SearchEngineId, { initial: string; tint: string; host: string }> = {
  duckduckgo: { initial: 'D', tint: '#de5833', host: 'duckduckgo.com' },
  brave: { initial: 'B', tint: '#fb542b', host: 'search.brave.com' },
  startpage: { initial: 'S', tint: '#6a73d8', host: 'www.startpage.com' },
  google: { initial: 'G', tint: '#4285f4', host: 'www.google.com' },
  bing: { initial: 'B', tint: '#0ca6a6', host: 'www.bing.com' },
  ecosia: { initial: 'E', tint: '#2f6b3f', host: 'www.ecosia.org' },
  qwant: { initial: 'Q', tint: '#4957d6', host: 'www.qwant.com' },
  searxng: { initial: 'X', tint: '#62a583', host: 'searx.be' }
}

const ESSENTIALS: { name: string; mark: string; tint: string; url: string }[] = [
  { name: 'GitHub', mark: 'GH', tint: '#24292f', url: 'https://github.com' },
  { name: 'Notion', mark: 'N', tint: '#111111', url: 'https://www.notion.so' },
  { name: 'Figma', mark: 'F', tint: '#a259ff', url: 'https://www.figma.com' },
  { name: 'Linear', mark: 'L', tint: '#5e6ad2', url: 'https://linear.app' },
  { name: 'YouTube', mark: 'YT', tint: '#ff0033', url: 'https://www.youtube.com' },
  { name: 'Wikipédia', mark: 'W', tint: '#54595d', url: 'https://fr.wikipedia.org' },
  { name: 'Le Monde', mark: 'LM', tint: '#1d4ed8', url: 'https://www.lemonde.fr' },
  { name: 'Hacker News', mark: 'HN', tint: '#ff6600', url: 'https://news.ycombinator.com' }
]

const DEFAULT_ESSENTIALS = ['https://github.com', 'https://www.notion.so']

function extractBookmarkEntries(html: string): { title: string; url: string }[] {
  const entries = new Map<string, string>()
  const doc = new DOMParser().parseFromString(html, 'text/html')
  for (const anchor of Array.from(doc.querySelectorAll('a[href]'))) {
    try {
      const url = new URL(anchor.getAttribute('href') || '')
      if ((url.protocol === 'https:' || url.protocol === 'http:') && !entries.has(url.href)) {
        entries.set(url.href, anchor.textContent?.trim().slice(0, 160) || url.hostname)
      }
    } catch {
      // Ignore invalid bookmark URLs.
    }
    if (entries.size >= 500) break
  }
  return Array.from(entries, ([url, title]) => ({ title, url }))
}

export default function Onboarding() {
  const view = useBrowser((s) => s.view)
  const importBookmarks = useBrowser((s) => s.importBookmarks)
  const pinEssentials = useBrowser((s) => s.pinEssentials)
  const updateSettings = useBrowser((s) => s.updateSettings)
  const completeOnboarding = useBrowser((s) => s.completeOnboarding)
  const setOverlay = useBrowser((s) => s.setOverlay)
  const [step, setStep] = useState(0)
  const [selected, setSelected] = useState<string[]>(DEFAULT_ESSENTIALS)
  const [detected, setDetected] = useState<BookmarkImportSource[] | null>(null)
  const [instance, setInstance] = useState('')

  useEffect(() => {
    let alive = true
    void window.vela.bookmarks
      .detect()
      .then((sources) => {
        if (alive) setDetected(sources)
      })
      .catch(() => {
        if (alive) setDetected([])
      })
    return () => {
      alive = false
    }
  }, [])

  const searxSetting = view?.settings.searxInstance ?? ''
  useEffect(() => {
    setInstance(searxSetting)
  }, [searxSetting])

  if (!view) return null
  const settings = view.settings
  const current = STEPS[step]

  const finish = () => {
    void completeOnboarding()
  }

  const toggleEssential = (url: string): void => {
    setSelected((list) => (list.includes(url) ? list.filter((item) => item !== url) : [...list, url]))
  }

  const importSource = (source: BookmarkImportSource): void => {
    void importBookmarks(
      source.urls.map((entry) => entry.url),
      source.urls
    )
  }

  return (
    <div className="overlay onboarding-overlay" role="dialog" aria-label="Bienvenue dans Vela">
      <div className="onboarding-sheet" onMouseDown={(e) => e.stopPropagation()}>
        <aside className="onboarding-stage" aria-hidden="true">
          <span className="onboarding-glow" />
          <span className="onboarding-orb">
            <Icon name={current.icon} size={54} />
          </span>
          <span className="onboarding-stage-count">
            <strong>{String(step + 1).padStart(2, '0')}</strong>
            <span>/ {String(STEPS.length).padStart(2, '0')}</span>
          </span>
          <span className="onboarding-stage-kicker">{current.kicker}</span>
        </aside>

        <div className="onboarding-main">
          <header className="onboarding-top">
            <span className="wordmark">Vela<span className="wordmark-dot">.</span></span>
            <button type="button" className="onboarding-skip" onClick={finish}>Passer</button>
          </header>

          <div className="onboarding-copy">
            <h1>{current.title}</h1>
            <p className="onboarding-lede">{current.lede}</p>
          </div>

          <div className="onboarding-body">
            {step === 0 && (
              <>
                <div className="engine-grid" role="radiogroup" aria-label="Moteur de recherche">
                  {(Object.keys(SEARCH_ENGINES) as SearchEngineId[]).map((id) => {
                    const look = ENGINE_LOOK[id]
                    const active = settings.searchEngine === id
                    return (
                      <button
                        key={id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        aria-label={SEARCH_ENGINES[id].label}
                        className="engine-tile"
                        data-active={active}
                        style={{ '--tint': look.tint } as CSSProperties}
                        onClick={() => void updateSettings({ searchEngine: id })}
                      >
                        <span
                          className="engine-mark"
                          aria-hidden="true"
                          style={{ background: `${look.tint}22`, color: look.tint }}
                        >
                          {look.initial}
                        </span>
                        <span className="engine-label">{SEARCH_ENGINES[id].label}</span>
                        {active && <span className="engine-check"><Icon name="check" size={13} /></span>}
                      </button>
                    )
                  })}
                </div>

                {settings.searchEngine === 'searxng' && (
                  <label className="field onboarding-instance">
                    <span>Instance SearXNG</span>
                    <input
                      value={instance}
                      placeholder={searxBase(instance).replace(/^https?:\/\//, '')}
                      spellCheck={false}
                      autoComplete="off"
                      onChange={(event) => setInstance(event.target.value)}
                      onBlur={() => void updateSettings({ searxInstance: instance.trim() })}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          void updateSettings({ searxInstance: instance.trim() })
                        }
                      }}
                    />
                    <small className="setting-hint">Laisser vide pour searx.be.</small>
                  </label>
                )}

                <div className="onboarding-row" data-on={settings.blockTrackers}>
                  <span className="onboarding-row-icon"><Icon name="shield" size={22} /></span>
                  <span className="onboarding-row-copy">
                    <strong>Bloqueur local</strong>
                    <small>
                      {view.blockedTotal > 0
                        ? `${view.blockedTotal} requête${view.blockedTotal === 1 ? '' : 's'} arrêtée${view.blockedTotal === 1 ? '' : 's'} cette session — en local`
                        : 'Publicités et traqueurs arrêtés sur cet appareil'}
                    </small>
                  </span>
                  <button
                    type="button"
                    className="switch"
                    role="switch"
                    aria-checked={settings.blockTrackers}
                    aria-label="Bloquer les traqueurs"
                    data-on={settings.blockTrackers}
                    onClick={() => void updateSettings({ blockTrackers: !settings.blockTrackers })}
                  ><span /></button>
                </div>

                <div className="onboarding-detected">
                  <span className="field-label">Favoris de vos autres navigateurs</span>
                  {detected === null && <p className="setting-hint">Recherche des profils installés…</p>}
                  {detected !== null && detected.length > 0 && (
                    <div className="detected-list">
                      {detected.map((source) => (
                        <button
                          key={source.id}
                          type="button"
                          className="detected-row"
                          onClick={() => importSource(source)}
                        >
                          <span className="onboarding-row-copy">
                            <strong>{source.label}</strong>
                            <small>{source.count} favoris trouvés sur cet appareil</small>
                          </span>
                          <span className="detected-action">Importer</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {detected !== null && detected.length === 0 && (
                    <p className="setting-hint">
                      Aucun profil lisible. Sur macOS, autorisez Vela dans Réglages Système →
                      Confidentialité → Accès complet au disque pour lire Safari, ou importez un export HTML.
                    </p>
                  )}
                  <label className="onboarding-row is-action">
                    <span className="onboarding-row-icon"><Icon name="download" size={22} /></span>
                    <span className="onboarding-row-copy">
                      <strong>Importer un fichier de favoris</strong>
                      <small>Export HTML de Chrome, Firefox ou Safari — vers vos marque-pages Vela</small>
                    </span>
                    <Icon name="arrow-right" size={16} />
                    <input
                      type="file"
                      accept=".html,.htm"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        void file.text().then((text) => {
                          const entries = extractBookmarkEntries(text)
                          void importBookmarks(entries.map(({ url }) => url), entries)
                        })
                      }}
                    />
                  </label>
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <div className="essentials-grid">
                  {ESSENTIALS.map((app) => {
                    const active = selected.includes(app.url)
                    return (
                      <button
                        key={app.name}
                        type="button"
                        className="essentials-tile"
                        data-active={active}
                        aria-pressed={active}
                        onClick={() => toggleEssential(app.url)}
                      >
                        <span
                          className="essentials-mark"
                          aria-hidden="true"
                          style={{ background: `${app.tint}22`, color: app.tint }}
                        >
                          {app.mark}
                        </span>
                        <span className="essentials-name">{app.name}</span>
                        <span className="essentials-check">
                          {active && <Icon name="check" size={12} />}
                        </span>
                      </button>
                    )
                  })}
                </div>
                <div className="onboarding-preview" aria-hidden="true">
                  <span className="onboarding-preview-title">Votre barre latérale</span>
                  <span className="onboarding-preview-pins">
                    {ESSENTIALS.filter((app) => selected.includes(app.url)).slice(0, 5).map((app) => (
                      <span key={app.url} className="onboarding-preview-pin">
                        <span className="essentials-mark" aria-hidden="true" style={{ background: `${app.tint}22`, color: app.tint }}>
                          {app.mark}
                        </span>
                        {app.name}
                      </span>
                    ))}
                    {selected.length === 0 && <span className="setting-hint">Rien de sélectionné.</span>}
                  </span>
                </div>
                <button
                  type="button"
                  className="action primary onboarding-cta"
                  disabled={selected.length === 0}
                  onClick={() => void pinEssentials(selected)}
                >
                  Épingler {selected.length > 1 ? `les ${selected.length} pages` : 'la page'}
                </button>
              </>
            )}

            {step === 2 && (
              <>
                <div className="shortcut-grid">
                  {[
                    ['⌘K', 'Lanceur'],
                    ['⌘J', 'Agent'],
                    ['⌘E', 'Notes'],
                    ['⌘F', 'Chercher dans la page']
                  ].map(([keys, label]) => (
                    <span key={keys} className="shortcut-tile">
                      <kbd>{keys}</kbd>
                      <span>{label}</span>
                    </span>
                  ))}
                </div>
                <button type="button" className="action primary onboarding-cta" onClick={() => setOverlay('command')}>
                  <Icon name="search" size={15} />
                  Essayer le lanceur
                </button>
              </>
            )}

            {step === 3 && (
              <div className="agent-modes">
                <button
                  type="button"
                  className="agent-mode"
                  data-active={settings.agent.mode === 'demo'}
                  onClick={() => void updateSettings({ agent: { mode: 'demo' } })}
                >
                  <span className="agent-mode-icon"><Icon name="sparkles" size={22} /></span>
                  <span className="agent-mode-top">Démo locale</span>
                  <span className="agent-mode-detail">Rapport simulé depuis les titres : aucun envoi.</span>
                </button>
                <button
                  type="button"
                  className="agent-mode"
                  data-active={settings.agent.mode === 'api'}
                  onClick={() => { void updateSettings({ agent: { mode: 'api' } }); setOverlay('settings') }}
                >
                  <span className="agent-mode-icon"><Icon name="key" size={22} /></span>
                  <span className="agent-mode-top">Votre clé ou Ollama</span>
                  <span className="agent-mode-detail">Le texte des onglets joints part alors vers le modèle choisi.</span>
                </button>
              </div>
            )}

            {step === 4 && (
              <div className="appearance-grid" role="radiogroup" aria-label="Thème de couleur">
                {THEME_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    role="radio"
                    aria-checked={settings.themeId === preset.id}
                    className="appearance-choice"
                    data-active={settings.themeId === preset.id}
                    onClick={() => void updateSettings({ themeId: preset.id })}
                  >
                    <span
                      className="appearance-choice-dot"
                      style={{ background: preset.light }}
                      aria-hidden="true"
                    />
                    {preset.label}
                  </button>
                ))}
              </div>
            )}

            {step === 5 && (
              <div className="ready-grid">
                <div className="ready-tile">
                  <Icon name="shield" size={24} />
                  <strong>{settings.blockTrackers ? 'Bloqueur local activé' : 'Bloqueur désactivé'}</strong>
                  <small>Publicités et traqueurs arrêtés sur cet appareil.</small>
                </div>
                <div className="ready-tile">
                  <Icon name="notes" size={24} />
                  <strong>Notes en fichiers Markdown</strong>
                  <small>Un dossier à vous, lisible dans le Finder.</small>
                </div>
                <div className="ready-tile">
                  <Icon name="calendar" size={24} />
                  <strong>Brief du jour sur cet appareil</strong>
                  <small>Calculé à partir de vos onglets et de votre historique.</small>
                </div>
              </div>
            )}
          </div>

          <footer className="onboarding-foot">
            <button type="button" className="onboarding-back" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>
              Retour
            </button>
            <span className="onboarding-dots" aria-hidden="true">
              {STEPS.map((_, i) => <i key={i} data-active={i === step} data-done={i < step} />)}
            </span>
            {step < STEPS.length - 1 ? (
              <button type="button" className="action primary onboarding-next" onClick={() => setStep((s) => s + 1)}>
                Continuer <Icon name="arrow-right" size={15} />
              </button>
            ) : (
              <button type="button" className="action primary onboarding-next" onClick={finish}>
                Commencer <Icon name="arrow-right" size={15} />
              </button>
            )}
          </footer>
        </div>
      </div>
    </div>
  )
}
