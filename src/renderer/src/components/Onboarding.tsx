import { useState } from 'react'
import { SEARCH_ENGINES } from '@shared/url'
import type { SearchEngineId } from '@shared/types'
import { useBrowser } from '../store/browser'
import { Icon } from './Icon'

const STEPS = [
  { title: 'Emportez votre web avec vous.', lede: 'Le moteur que vous connaissez, sans compte ni télémétrie.' },
  { title: 'Gardez ce que vous utilisez chaque jour.', lede: 'Un espace par contexte. Les onglets attendent en barre latérale et ne chargent qu’à l’ouverture.' },
  { title: 'Toujours à une touche.', lede: 'Le lanceur trouve un onglet, une note, une tâche ou une page d’historique sans changer de fenêtre.' },
  { title: 'Déléguez le fastidieux.', lede: 'L’agent lit les onglets que vous choisissez et prépare un rapport à relire avant usage.' },
  { title: 'Prêt quand vous l’êtes.', lede: 'Bloqueur local, tâches du jour et notes Markdown que vous possédez.' }
]

function extractUrls(html: string): string[] {
  const urls: string[] = []
  const re = /HREF="([^"]+)"/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    if (/^https?:/i.test(m[1])) urls.push(m[1])
    if (urls.length >= 20) break
  }
  return urls
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

  const finish = () => {
    void completeOnboarding()
  }

  return (
    <div className="overlay onboarding-overlay" role="dialog" aria-label="Bienvenue dans Vela">
      <div className="sheet onboarding-sheet" onMouseDown={(e) => e.stopPropagation()}>
        <div className="onboarding-top">
          <span className="wordmark">Vela<span className="wordmark-dot">.</span></span>
          <button type="button" className="text-btn" onClick={finish}>Passer</button>
        </div>

        <h1>{STEPS[step].title}</h1>
        <p className="onboarding-lede">{STEPS[step].lede}</p>

        <div className="onboarding-body">
          {step === 0 && (
            <div className="onboarding-cards">
              <div className="setting-row">
                <div>
                  <label>Chercher avec</label>
                  <p className="setting-hint">Comme Zephium : Google, DuckDuckGo, Brave ou Bing via DuckDuckGo.</p>
                </div>
                <select
                  className="select"
                  value={settings.searchEngine}
                  onChange={(e) => void updateSettings({ searchEngine: e.target.value as SearchEngineId })}
                >
                  {Object.entries(SEARCH_ENGINES).map(([id, engine]) => (
                    <option key={id} value={id}>{engine.label}</option>
                  ))}
                </select>
              </div>
              <div className="setting-row">
                <div>
                  <label>Bloquer pubs et traqueurs</label>
                  <p className="setting-hint">{view.blockedTotal} requêtes bloquées cette session.</p>
                </div>
                <button
                  type="button" className="switch" role="switch"
                  aria-checked={settings.blockTrackers} data-on={settings.blockTrackers}
                  onClick={() => void updateSettings({ blockTrackers: !settings.blockTrackers })}
                ><span /></button>
              </div>
            </div>
          )}
          {step === 0 && (
            <div style={{ marginTop: 10 }}>
              <label className="ghost-btn" style={{ cursor: 'pointer' }}>
                Importer un export HTML
                <input
                  type="file" accept=".html,.htm" style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    void file.text().then((text) => void importBookmarks(extractUrls(text)))
                  }}
                />
              </label>
            </div>
          )}
          {step === 1 && (
            <div className="onboarding-apps">
              {['GitHub', 'Gmail', 'Notion', 'Figma', 'Slack', 'YouTube', 'Spotify', 'ChatGPT'].map((app) => (
                <span key={app} className="onboarding-app"><span className="onboarding-app-icon">{app[0]}</span>{app}</span>
              ))}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button type="button" className="action primary" onClick={() => void pinEssentials()}>Épingler mes essentiels</button>
              </div>
              <p className="setting-hint">GitHub, Gmail et Notion en tête d’espace, chargés seulement à l’ouverture.</p>
            </div>
          )}
          {step === 2 && (
            <div className="onboarding-shortcuts">
              <p><kbd>⌘K</kbd> lanceur — onglets, notes, tâches, historique</p>
              <p><kbd>⌘J</kbd> agent · <kbd>⌘E</kbd> notes · <kbd>⌘⇧B</kbd> brief</p>
              <button type="button" className="action" onClick={() => { setStep(4); setOverlay('command') }}>
                <Icon name="search" size={14} /> Essayer le lanceur
              </button>
            </div>
          )}
          {step === 3 && (
            <div className="agent-modes">
              <button type="button" className="agent-mode" data-active={settings.agent.mode === 'demo'} onClick={() => void updateSettings({ agent: { mode: 'demo' } })}>
                <span className="agent-mode-top"><Icon name="sparkles" size={15} /> Démo locale</span>
                <span className="agent-mode-detail">Simulé depuis vos onglets. Rien ne quitte la machine.</span>
              </button>
              <button type="button" className="agent-mode" data-active={settings.agent.mode === 'api'} onClick={() => { void updateSettings({ agent: { mode: 'api' } }); setOverlay('settings') }}>
                <span className="agent-mode-top"><Icon name="globe" size={15} /> Votre clé</span>
                <span className="agent-mode-detail">OpenAI, Anthropic, Google… ou serveur local Ollama. Réglages → Modèles.</span>
              </button>
            </div>
          )}
          {step === 4 && (
            <div className="onboarding-ready">
              <span className="onboarding-pill"><Icon name="shield" size={13} /> Pubs bloquées</span>
              <span className="onboarding-pill"><Icon name="notes" size={13} /> Notes locales</span>
              <span className="onboarding-pill"><Icon name="check" size={13} /> Tâches du jour</span>
              <p className="setting-hint">La barre sous la page d’accueil suit bloqués, focus et échéances — comme la barre ZEPHIUM.</p>
            </div>
          )}
        </div>

        <div className="onboarding-foot">
          <button type="button" className="text-btn" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>Retour</button>
          <span className="onboarding-dots" aria-hidden="true">
            {STEPS.map((_, i) => <i key={i} data-active={i === step} />)}
          </span>
          {step < STEPS.length - 1 ? (
            <button type="button" className="action primary" onClick={() => setStep((s) => s + 1)}>Continuer <Icon name="arrow-right" size={14} /></button>
          ) : (
            <button type="button" className="action primary" onClick={finish}>Commencer <Icon name="arrow-right" size={14} /></button>
          )}
        </div>
      </div>
    </div>
  )
}
