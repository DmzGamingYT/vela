import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { presetById, THEME_PRESETS } from '@shared/theme'
import { NETWORK_FLOWS } from '@shared/network'
import { APP_SHORTCUTS } from '@shared/shortcuts'
import { searxBase } from '@shared/url'
import type { BookmarkImportSource } from '@shared/types'
import { shortcut } from '../../lib/format'
import { useModalFocus } from '../../lib/useModalFocus'
import { useBrowser } from '../../store/browser'
import EnginePicker from '../EnginePicker'
import SiteMark, { type SiteBrand } from '../SiteMark'
import { Icon } from '../Icon'

interface Step {
  kicker: string
  title: string
  lede: string
}

/**
 * Cinq décisions, une par écran : le moteur, le bruit qu'on coupe, les habitués,
 * la teinte, et ce qui ne sort pas. La colonne de gauche n'est pas une image :
 * elle liste les étapes et permet d'y revenir.
 */
const STEPS: Step[] = [
  {
    kicker: 'Moteur',
    title: 'Votre web, à votre façon.',
    lede: 'Vos recherches vont au moteur que vous choisissez.'
  },
  {
    kicker: 'Bruit',
    title: 'Moins de bruit, tout de suite.',
    lede: 'Le filtre tourne en local, et vos favoris existants vous suivent.'
  },
  {
    kicker: 'Habitués',
    title: 'Vos habitués, un clic plus loin.',
    lede: 'Épinglés dans l’espace, ouverts seulement quand vous cliquez.'
  },
  {
    kicker: 'Teinte',
    title: 'Une teinte à vous.',
    lede: 'Tout le châssis la reprend. Les sites visités gardent leurs couleurs.'
  },
  {
    kicker: 'Chez vous',
    title: 'Ce qui sort, et quand.',
    lede: 'Aucun compte, aucun serveur Vela, aucune mesure d’usage. Voici les requêtes que Vela déclenche lui-même.'
  }
]

const ESSENTIALS: { name: string; url: string; brand?: SiteBrand }[] = [
  { name: 'GitHub', url: 'https://github.com', brand: 'github' },
  { name: 'Notion', url: 'https://www.notion.so', brand: 'notion' },
  { name: 'Figma', url: 'https://www.figma.com', brand: 'figma' },
  { name: 'Linear', url: 'https://linear.app', brand: 'linear' },
  { name: 'YouTube', url: 'https://www.youtube.com', brand: 'youtube' },
  { name: 'Wikipédia', url: 'https://fr.wikipedia.org', brand: 'wikipedia' },
  { name: 'Le Monde', url: 'https://www.lemonde.fr' },
  { name: 'Hacker News', url: 'https://news.ycombinator.com', brand: 'hackernews' }
]

const DEFAULT_ESSENTIALS = ['https://github.com', 'https://www.notion.so']

/** Les flux que l'écran final montre, avec leur propre mécanisme d'arrêt. */
const FLOW_IDS = [
  'moteur-recherche',
  'mises-a-jour',
  'modeles',
  'tunnel-fournisseurs',
  'bd-ocr'
] as const

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
  const sheetRef = useModalFocus<HTMLDivElement>()
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
    queueMicrotask(() => setInstance(searxSetting))
  }, [searxSetting])

  // Le focus part sur l'action principale, pas sur « Passer » : le premier
  // anneau de focus ne doit pas désigner la sortie.
  useEffect(() => {
    sheetRef.current?.querySelector<HTMLButtonElement>('.onboarding-next')?.focus()
  }, [sheetRef])

  const finish = (): void => {
    void completeOnboarding()
  }

  const last = STEPS.length - 1

  // Clavier : Entrée avance (sauf sur un contrôle, qui garde son propre clic),
  // les flèches naviguent, Échap passe. Un composant qui a déjà traité la
  // touche (le choix du moteur, par exemple) garde la priorité.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        finish()
        return
      }
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target instanceof HTMLElement ? event.target : null
      const onControl = Boolean(
        target?.closest('button, a, input, textarea, select, [role="switch"]')
      )
      if (event.key === 'Enter') {
        if (onControl) return
        event.preventDefault()
        setStep((current) => Math.min(last, current + 1))
        return
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        setStep((current) => Math.min(last, current + 1))
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        setStep((current) => Math.max(0, current - 1))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!view) return null
  const settings = view.settings
  const current = STEPS[step]
  const spaceId = view.activeSpaceId
  const preset = presetById(settings.themeId)
  const dark = document.documentElement.dataset.mode === 'dark'
  const accent = preset ? (dark ? preset.dark : preset.light) : settings.customAccent || '#5B5BD6'

  const toggleEssential = (url: string): void => {
    setSelected((list) =>
      list.includes(url) ? list.filter((item) => item !== url) : [...list, url]
    )
  }

  const importSource = (source: BookmarkImportSource): void => {
    void importBookmarks(
      source.urls.map((entry) => entry.url),
      source.urls
    )
  }

  return (
    <div
      className="overlay onboarding-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Bienvenue dans Vela"
    >
      <div ref={sheetRef} className="onboarding-sheet" onMouseDown={(e) => e.stopPropagation()}>
        <span
          className="onboarding-progress"
          aria-hidden="true"
          style={{ '--progress': `${((step + 1) / STEPS.length) * 100}%` } as CSSProperties}
        >
          <i />
        </span>

        <aside className="onboarding-stage onboarding-steps" aria-label="Étapes">
          <span className="onboarding-glow" aria-hidden="true" />
          <ol className="step-list">
            {STEPS.map((item, index) => {
              const active = index === step
              const done = index < step
              return (
                <li key={item.kicker}>
                  <button
                    type="button"
                    className="step-item"
                    data-active={active}
                    data-done={done}
                    aria-current={active ? 'step' : undefined}
                    onClick={() => setStep(index)}
                  >
                    <span className="step-marker">
                      {done ? <Icon name="check" size={12} /> : String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="step-labels">
                      <span className="step-kicker">{item.kicker}</span>
                      <span className="step-title">{item.title}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        </aside>

        <div className="onboarding-main">
          <header className="onboarding-top">
            <span className="wordmark">
              Vela<span className="wordmark-dot">.</span>
            </span>
            <button type="button" className="onboarding-skip" onClick={finish}>
              Passer
            </button>
          </header>

          <div className="onboarding-copy">
            <h1>{current.title}</h1>
            <p className="onboarding-lede">{current.lede}</p>
          </div>

          <div className="onboarding-body" key={step}>
            {step === 0 && (
              <>
                <EnginePicker
                  value={settings.searchEngine}
                  onChange={(id) => void updateSettings({ searchEngine: id })}
                  label="Moteur de recherche"
                  variant="list"
                />

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

                <p className="onboarding-note">
                  <Icon name="lock" size={13} />
                  Une adresse s’ouvre, une question part vers ce moteur. Vela n’ajoute rien au
                  milieu.
                </p>
              </>
            )}

            {step === 1 && (
              <>
                <div className="onboarding-row" data-on={settings.blockTrackers}>
                  <span className="onboarding-row-icon">
                    <Icon name="shield" size={22} />
                  </span>
                  <span className="onboarding-row-copy">
                    <strong>Bloqueur local</strong>
                    <small>
                      {!settings.blockTrackers
                        ? 'Désactivé : la page charge tout ce qu’elle demande.'
                        : view.blockedTotal > 0
                          ? `${view.blockedTotal} requête${view.blockedTotal === 1 ? '' : 's'} arrêtée${view.blockedTotal === 1 ? '' : 's'} cette session, en local`
                          : 'Liste embarquée : publicités et traqueurs arrêtés sur cet appareil'}
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
                  >
                    <span />
                  </button>
                </div>

                <div className="onboarding-detected">
                  <span className="field-label">Favoris de vos autres navigateurs</span>
                  {detected === null && (
                    <p className="setting-hint">Recherche des profils installés…</p>
                  )}
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
                      Confidentialité → Accès complet au disque pour lire Safari, ou importez un
                      export HTML.
                    </p>
                  )}
                  <label className="onboarding-row is-action">
                    <span className="onboarding-row-icon">
                      <Icon name="download" size={22} />
                    </span>
                    <span className="onboarding-row-copy">
                      <strong>Importer un fichier de favoris</strong>
                      <small>
                        Export HTML de Chrome, Firefox ou Safari — vers vos marque-pages Vela
                      </small>
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
                          void importBookmarks(
                            entries.map(({ url }) => url),
                            entries
                          )
                        })
                      }}
                    />
                  </label>
                </div>
              </>
            )}

            {step === 2 && (
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
                        <SiteMark
                          brand={app.brand}
                          url={app.url}
                          label={app.name}
                          size={22}
                          spaceId={spaceId}
                        />
                        <span className="essentials-name">{app.name}</span>
                        <span className="essentials-check">
                          {active && <Icon name="check" size={12} />}
                        </span>
                      </button>
                    )
                  })}
                </div>
                <button
                  type="button"
                  className="action onboarding-cta"
                  disabled={selected.length === 0}
                  onClick={() => void pinEssentials(selected)}
                >
                  Épingler {selected.length > 1 ? `les ${selected.length} pages` : 'la page'}
                </button>
              </>
            )}

            {step === 3 && (
              <div className="theme-picker">
                <div className="theme-swatches" role="radiogroup" aria-label="Thème de couleur">
                  {THEME_PRESETS.map((item) => {
                    const active = settings.themeId === item.id
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        aria-label={item.label}
                        className="theme-swatch"
                        data-active={active}
                        style={{ '--swatch': item.light } as CSSProperties}
                        onClick={() => void updateSettings({ themeId: item.id })}
                      >
                        <span className="theme-swatch-dot">
                          {active && <Icon name="check" size={15} />}
                        </span>
                        <span className="theme-swatch-name">{item.label}</span>
                      </button>
                    )
                  })}
                </div>

                <div
                  className="theme-preview"
                  style={{ '--swatch': accent } as CSSProperties}
                  aria-hidden="true"
                >
                  <span className="theme-preview-rail">
                    <i data-on="true" />
                    <i />
                    <i />
                  </span>
                  <span className="theme-preview-page">
                    <span className="theme-preview-kicker">Papier · accent · texte sur accent</span>
                    <span className="theme-preview-line" />
                    <span className="theme-preview-line is-short" />
                    <span className="theme-preview-actions">
                      <span className="theme-preview-btn">Bouton</span>
                      <span className="theme-preview-ghost">Lien discret</span>
                    </span>
                  </span>
                </div>
              </div>
            )}

            {step === 4 && (
              <>
                <div className="onboarding-local">
                  <div className="local-row">
                    <span className="local-row-icon">
                      <Icon name="shield" size={18} />
                    </span>
                    <span>
                      <strong>Pas de compte, pas de serveur Vela</strong>
                      <small>
                        Espaces, onglets, favoris et réglages vivent dans un dossier sur cet
                        appareil.
                      </small>
                    </span>
                  </div>
                  <div className="local-row">
                    <span className="local-row-icon">
                      <Icon name="notes" size={18} />
                    </span>
                    <span>
                      <strong>Notes en fichiers Markdown</strong>
                      <small>Un dossier à vous, lisible dans le Finder, sans Vela.</small>
                    </span>
                  </div>
                </div>

                <div className="onboarding-flows">
                  {FLOW_IDS.map((id) => {
                    const flow = NETWORK_FLOWS.find((entry) => entry.id === id)
                    if (!flow) return null
                    return (
                      <span key={id} className="onboarding-flow" title={flow.data}>
                        <b>{flow.label}</b> · {flow.target}
                      </span>
                    )
                  })}
                </div>

                <p className="onboarding-note">
                  <Icon name="lock" size={13} />
                  Les pages et leurs icônes sortent aussi vers les sites que vous ouvrez. Le détail,
                  flux par flux, est dans Réglages › Confidentialité.
                </p>

                <div className="onboarding-keys">
                  {[
                    [shortcut('K'), 'Lanceur'],
                    [shortcut(APP_SHORTCUTS.agent.key), 'Agent'],
                    [shortcut(APP_SHORTCUTS.notes.key), 'Notes'],
                    [shortcut('F'), 'Chercher']
                  ].map(([keys, label]) => (
                    <span key={keys}>
                      <kbd>{keys}</kbd>
                      {label}
                    </span>
                  ))}
                </div>

                <button
                  type="button"
                  className="onboarding-model-link"
                  onClick={() => {
                    void completeOnboarding().then(() => setOverlay('settings'))
                  }}
                >
                  Configurer un modèle pour l’agent
                  <Icon name="arrow-right" size={14} />
                </button>
              </>
            )}
          </div>

          <footer className="onboarding-foot">
            <button
              type="button"
              className="onboarding-back"
              disabled={step === 0}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
            >
              Retour
            </button>
            <span className="onboarding-dots" aria-hidden="true">
              {STEPS.map((_, i) => (
                <i key={i} data-active={i === step} data-done={i < step} />
              ))}
            </span>
            {step < last ? (
              <button
                type="button"
                className="action primary onboarding-next"
                onClick={() => setStep((s) => s + 1)}
              >
                Continuer <kbd>↵</kbd>
              </button>
            ) : (
              <button type="button" className="action primary onboarding-next" onClick={finish}>
                Commencer <kbd>↵</kbd>
              </button>
            )}
          </footer>
        </div>
      </div>
    </div>
  )
}
