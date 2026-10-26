import { useState } from 'react'
import type { CSSProperties } from 'react'
import { SEARCH_ENGINES } from '@shared/url'
import type { SearchEngineId } from '@shared/types'
import { useBrowser } from '../store/browser'
import { Icon, type IconName } from './Icon'

interface Step {
  kicker: string
  title: string
  lede: string
  icon: IconName
}

const STEPS: Step[] = [
  { kicker: 'Moteur', title: 'Votre web, à votre façon.', lede: 'Le moteur que vous connaissez. Rien d’autre ne sort d’ici.', icon: 'search' },
  { kicker: 'Essentiels', title: 'Vos habitués, en un clic.', lede: 'Épinglés dans l’espace, chargés seulement à l’ouverture.', icon: 'folder' },
  { kicker: 'Raccourcis', title: 'Tout à une touche.', lede: 'Onglets, notes, agent : sans quitter la page.', icon: 'command' },
  { kicker: 'Agent', title: 'Déléguez le fastidieux.', lede: 'Il lit les onglets que vous choisissez, vous relisez.', icon: 'sparkles' },
  { kicker: 'Prêt', title: 'Vous êtes chez vous.', lede: 'Bloqueur local, notes et tâches à vous.', icon: 'shield' }
]

const ENGINE_LOOK: Record<SearchEngineId, { initial: string; tint: string }> = {
  duckduckgo: { initial: 'D', tint: '#de5833' },
  brave: { initial: 'B', tint: '#fb542b' },
  startpage: { initial: 'S', tint: '#6a73d8' },
  searxng: { initial: 'X', tint: '#62a583' }
}

const ESSENTIALS = ['GitHub', 'Gmail', 'Notion', 'Figma', 'Slack', 'YouTube', 'Spotify', 'ChatGPT']

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
    if (entries.size >= 200) break
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

  if (!view) return null
  const settings = view.settings
  const current = STEPS[step]

  const finish = () => {
    void completeOnboarding()
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
                        <span className="engine-mark" aria-hidden="true">{look.initial}</span>
                        <span className="engine-label">{SEARCH_ENGINES[id].label}</span>
                        {active && <span className="engine-check"><Icon name="check" size={13} /></span>}
                      </button>
                    )
                  })}
                </div>

                <div className="onboarding-row" data-on={settings.blockTrackers}>
                  <span className="onboarding-row-icon"><Icon name="shield" size={22} /></span>
                  <span className="onboarding-row-copy">
                    <strong>Traqueurs bloqués</strong>
                    <small>{view.blockedTotal} requête{view.blockedTotal === 1 ? '' : 's'} arrêtée{view.blockedTotal === 1 ? '' : 's'} — en local</small>
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

                <label className="onboarding-row is-action">
                  <span className="onboarding-row-icon"><Icon name="download" size={22} /></span>
                  <span className="onboarding-row-copy">
                    <strong>Importer mes favoris</strong>
                    <small>Favoris Chrome, Firefox ou Safari · export HTML</small>
                  </span>
                  <Icon name="arrow-right" size={16} />
                  <input
                    type="file"
                    accept=".html,.htm"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      void file.text().then((text) => void importBookmarks(extractBookmarkEntries(text).map(({ url }) => url)))
                    }}
                  />
                </label>
              </>
            )}

            {step === 1 && (
              <>
                <div className="essentials-grid">
                  {ESSENTIALS.map((app, index) => (
                    <span key={app} className="essentials-tile" style={{ '--tint': ['#24292f', '#ea4335', '#111111', '#a259ff', '#611f69', '#ff0033', '#1db954', '#10a37f'][index] } as CSSProperties}>
                      <span className="essentials-mark" aria-hidden="true">{app[0]}</span>
                      <span className="essentials-name">{app}</span>
                    </span>
                  ))}
                </div>
                <button type="button" className="action primary onboarding-cta" onClick={() => void pinEssentials()}>
                  Épingler mes essentiels
                </button>
              </>
            )}

            {step === 2 && (
              <>
                <div className="shortcut-grid">
                  {[
                    ['⌘K', 'Lanceur'],
                    ['⌘J', 'Agent'],
                    ['⌘E', 'Notes']
                  ].map(([keys, label]) => (
                    <span key={keys} className="shortcut-tile">
                      <kbd>{keys}</kbd>
                      <span>{label}</span>
                    </span>
                  ))}
                </div>
                <button type="button" className="action primary onboarding-cta" onClick={() => { setStep(4); setOverlay('command') }}>
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
                  <span className="agent-mode-detail">Simulé depuis vos onglets.</span>
                </button>
                <button
                  type="button"
                  className="agent-mode"
                  data-active={settings.agent.mode === 'api'}
                  onClick={() => { void updateSettings({ agent: { mode: 'api' } }); setOverlay('settings') }}
                >
                  <span className="agent-mode-icon"><Icon name="key" size={22} /></span>
                  <span className="agent-mode-top">Votre clé</span>
                  <span className="agent-mode-detail">OpenAI, Anthropic, Ollama…</span>
                </button>
              </div>
            )}

            {step === 4 && (
              <div className="ready-grid">
                <span className="ready-tile">
                  <Icon name="shield" size={26} />
                  <strong>{view.blockedTotal}</strong>
                  <small>traqueurs arrêtés</small>
                </span>
                <span className="ready-tile">
                  <Icon name="notes" size={26} />
                  <strong>.md</strong>
                  <small>notes à vous</small>
                </span>
                <span className="ready-tile">
                  <Icon name="calendar" size={26} />
                  <strong>Jour</strong>
                  <small>tâches et brief</small>
                </span>
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
