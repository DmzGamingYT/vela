import { useState } from 'react'
import { SEARCH_ENGINES } from '@shared/url'
import { PROVIDERS, providerById, providerReady, providerState } from '@shared/providers'
import type {
  AgentMode,
  ProviderId,
  ProviderSettings,
  SearchEngineId,
  Theme
} from '@shared/types'
import { plural, shortcut } from '../lib/format'
import { useBrowser } from '../store/browser'
import { Icon, type IconName } from './Icon'

type Page = 'appearance' | 'navigation' | 'privacy' | 'models' | 'agent' | 'notes' | 'shortcuts' | 'about'

const NAV: { group: string; items: { id: Page; label: string; icon: IconName }[] }[] = [
  {
    group: 'Navigateur',
    items: [
      { id: 'appearance', label: 'Apparence', icon: 'sun' },
      { id: 'navigation', label: 'Navigation', icon: 'search' },
      { id: 'privacy', label: 'Confidentialité', icon: 'shield' }
    ]
  },
  {
    group: 'Agent',
    items: [
      { id: 'models', label: 'Modèles', icon: 'sparkles' },
      { id: 'agent', label: 'Comportement', icon: 'command' },
      { id: 'notes', label: 'Notes', icon: 'notes' }
    ]
  },
  {
    group: 'Application',
    items: [
      { id: 'shortcuts', label: 'Raccourcis', icon: 'key' },
      { id: 'about', label: 'À propos', icon: 'circle' }
    ]
  }
]

const COPY: Record<Page, { title: string; lede: string }> = {
  appearance: { title: 'Apparence', lede: 'Verre dépoli, thème clair ou sombre, ou comme le système.' },
  navigation: { title: 'Navigation', lede: 'Le moteur utilisé quand vous tapez une question, et la mémoire locale.' },
  privacy: { title: 'Confidentialité', lede: 'Le blocage se fait dans Chromium, avant le départ de la requête.' },
  models: { title: 'Modèles', lede: 'Les modèles que l’agent utilise et les clés associées.' },
  agent: { title: 'Comportement', lede: 'Démo locale, ou un fournisseur avec votre propre clé.' },
  notes: { title: 'Notes', lede: 'Des fichiers Markdown que vous possédez, dans le dossier de données de Vela.' },
  shortcuts: { title: 'Raccourcis', lede: 'Tous les raccourcis fonctionnent depuis une page comme depuis la coque.' },
  about: { title: 'À propos', lede: 'Vela 0.1 — Electron, React et Chromium.' }
}

const THEMES: { value: Theme; label: string; detail: string; icon: IconName }[] = [
  { value: 'light', label: 'Clair', detail: 'Verre blanc sur ciel clair.', icon: 'sun' },
  { value: 'dark', label: 'Sombre', detail: 'Verre fumé sur nuit profonde.', icon: 'moon' },
  { value: 'system', label: 'Système', detail: 'Suit votre Mac ou Windows.', icon: 'monitor' }
]

const SHORTCUTS: [string, string][] = [
  ['Barre de commande', shortcut('K')],
  ['Rechercher dans la page', shortcut('F')],
  ['Barre d’adresse', shortcut('L')],
  ['Nouvel onglet', shortcut('T')],
  ['Fermer l’onglet', shortcut('W')],
  ['Rouvrir l’onglet', shortcut('⇧T')],
  ['Vue scindée', shortcut('⇧D')],
  ['Notes', shortcut('E')],
  ['Agent', shortcut('J')],
  ['Atelier (Work)', shortcut('⇧A')],
  ['Brief du jour', shortcut('⇧B')],
  ['Barre latérale', shortcut('S')],
  ['Onglets 1 à 9', `${shortcut('1')} … ${shortcut('9')}`],
  ['Réglages', shortcut(',')]
]

interface Status {
  tone: 'ok' | 'error' | 'idle' | 'none'
  label: string
}

function statusOf(state: ProviderSettings, providerId: ProviderId): Status {
  const definition = providerById(providerId)
  if (state.status === 'ok' && (state.hasKey || definition.local)) {
    return {
      tone: 'ok',
      label: definition.local ? 'Serveur local joignable.' : state.detail || 'Clé acceptée.'
    }
  }
  if (state.status === 'error') {
    return { tone: 'error', label: state.detail || 'Clé refusée par le fournisseur.' }
  }
  if (state.hasKey) return { tone: 'idle', label: 'Clé enregistrée · non testée' }
  if (definition.local) return { tone: 'none', label: 'Serveur local · aucune clé requise' }
  return { tone: 'none', label: definition.detail }
}

export default function SettingsPanel() {
  const view = useBrowser((state) => state.view)
  const setOverlay = useBrowser((state) => state.setOverlay)
  const updateSettings = useBrowser((state) => state.updateSettings)
  const setKey = useBrowser((state) => state.setKey)
  const testKey = useBrowser((state) => state.testKey)
  const saveAgentNote = useBrowser((state) => state.saveAgentNote)
  const hasReport = useBrowser((state) => Boolean(state.agent.markdown))
  const toast = useBrowser((state) => state.toast)
  const update = useBrowser((state) => state.update)
  const checkUpdate = useBrowser((state) => state.checkUpdate)
  const installUpdate = useBrowser((state) => state.installUpdate)
  const openReleases = useBrowser((state) => state.openReleases)

  const [page, setPage] = useState<Page>('appearance')
  const [editing, setEditing] = useState<ProviderId | null>(null)
  const [keyDraft, setKeyDraft] = useState('')
  const [modelDraft, setModelDraft] = useState('')
  const [urlDraft, setUrlDraft] = useState('')
  const [testing, setTesting] = useState<ProviderId | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)

  if (!view) return null

  const settings = view.settings
  const agent = settings.agent
  const activeDefinition = providerById(agent.provider)
  const activeState = providerState(settings)
  const apiReady = providerReady(settings)

  const openEditor = (id: ProviderId): void => {
    const state = agent.providers[id]
    setEditing(id)
    setKeyDraft('')
    setModelDraft(state.model)
    setUrlDraft(state.baseUrl)
  }

  const chooseProvider = (id: ProviderId): void => {
    void updateSettings({ agent: { provider: id, mode: 'api' } })
  }

  const saveProvider = async (id: ProviderId): Promise<void> => {
    const definition = providerById(id)
    const url = urlDraft.trim()
    if (!/^https?:\/\//i.test(url)) {
      toast('L’endpoint doit commencer par http:// ou https://', 'error')
      return
    }
    if (keyDraft.trim()) {
      const saved = await setKey(id, keyDraft.trim())
      if (!saved) return
    }
    await updateSettings({
      providers: { [id]: { model: modelDraft.trim() || definition.model, baseUrl: url } }
    })
    setEditing(null)
    setKeyDraft('')
    toast('Fournisseur enregistré.')
  }

  const runTest = async (id: ProviderId): Promise<void> => {
    setTesting(id)
    const result = await testKey(id)
    setTesting(null)
    toast(result.message, result.ok ? 'info' : 'error')
  }

  const setMode = (mode: AgentMode): void => {
    void updateSettings({ agent: { mode } })
  }

  const renderModels = () => (
    <>
      <section className="setting-block">
        <div className="setting-head">
          <h2>Agent</h2>
          <p>Un rapport simulé sans quitter la machine, ou un vrai modèle.</p>
        </div>
        <div className="model-list">
          <div className="model-item">
            <div className="model-row" data-active={agent.mode === 'demo'}>
              <button
                type="button"
                className="model-select"
                onClick={() => setMode('demo')}
                aria-pressed={agent.mode === 'demo'}
              >
                <span className="model-mark" data-vela="true">
                  <Icon name="sparkles" size={15} />
                </span>
                <span className="model-copy">
                  <span className="model-name">
                    Démo locale <em className="model-chip">Sans clé</em>
                  </span>
                  <span className="model-detail" data-tone="none">
                    Rapports simulés à partir des titres de vos onglets. Aucune page ne quitte l’appareil.
                  </span>
                </span>
              </button>
              <div className="model-actions">
                {agent.mode === 'demo' ? (
                  <span className="model-state" data-tone="ok">
                    <i /> Activé
                  </span>
                ) : (
                  <button type="button" className="ghost-btn" onClick={() => setMode('demo')}>
                    Activer
                  </button>
                )}
              </div>
            </div>
          </div>

          {PROVIDERS.map((definition) => {
            const state = agent.providers[definition.id]
            const status = statusOf(state, definition.id)
            const isActive = agent.mode === 'api' && agent.provider === definition.id
            return (
              <div className="model-item" key={definition.id}>
                <div className="model-row" data-active={isActive} data-tone={status.tone}>
                  <button
                    type="button"
                    className="model-select"
                    onClick={() => chooseProvider(definition.id)}
                    aria-pressed={isActive}
                    title={`Utiliser ${definition.label}`}
                  >
                    <span
                      className="model-mark"
                      style={{
                        color: definition.color,
                        background: `color-mix(in srgb, ${definition.color} 16%, transparent)`,
                        borderColor: `color-mix(in srgb, ${definition.color} 30%, transparent)`
                      }}
                    >
                      {definition.mark}
                    </span>
                    <span className="model-copy">
                      <span className="model-name">
                        {definition.label}
                        {isActive && <em className="model-chip" data-accent="true">Actif</em>}
                      </span>
                      <span className="model-detail" data-tone={status.tone}>
                        {status.tone !== 'none' && <i className="model-dot" />}
                        {status.label}
                      </span>
                    </span>
                  </button>
                  <div className="model-actions">
                    {!state.hasKey && !definition.local && (
                      <a className="ghost-btn" href={definition.keyUrl} target="_blank" rel="noreferrer">
                        Obtenir
                      </a>
                    )}
                    {(state.hasKey || definition.local) && (
                      <button
                        type="button"
                        className="ghost-btn"
                        onClick={() => void runTest(definition.id)}
                        disabled={testing !== null}
                      >
                        {testing === definition.id ? 'Test…' : 'Tester'}
                      </button>
                    )}
                    <button type="button" className="ghost-btn" onClick={() => openEditor(definition.id)}>
                      {state.hasKey ? 'Modifier' : definition.local ? 'Configurer l’endpoint' : 'Ajouter une clé'}
                    </button>
                    {state.hasKey && (
                      <button
                        type="button"
                        className="icon-btn danger"
                        title="Supprimer la clé"
                        onClick={() => void setKey(definition.id, null)}
                      >
                        <Icon name="trash" size={13} />
                      </button>
                    )}
                  </div>
                </div>

                {editing === definition.id && (
                  <div className="model-editor">
                    <div className="field-grid">
                      <label className="field">
                        <span>
                          {definition.local ? 'Clé API (facultative)' : 'Clé API'}{' '}
                          {state.hasKey && <em>· enregistrée</em>}
                        </span>
                        <input
                          type="password"
                          value={keyDraft}
                          onChange={(event) => setKeyDraft(event.target.value)}
                          placeholder={state.hasKey ? 'Nouvelle clé (laisser vide pour conserver)' : definition.keyLabel}
                          spellCheck={false}
                          autoFocus
                        />
                      </label>
                      <label className="field">
                        <span>Modèle</span>
                        <input
                          value={modelDraft}
                          onChange={(event) => setModelDraft(event.target.value)}
                          placeholder={definition.model}
                          spellCheck={false}
                        />
                      </label>
                    </div>
                    <label className="field model-endpoint">
                      <span>Endpoint</span>
                      <input
                        value={urlDraft}
                        onChange={(event) => setUrlDraft(event.target.value)}
                        placeholder={definition.baseUrl}
                        spellCheck={false}
                      />
                    </label>
                    <div className="model-editor-foot">
                      <p className="setting-hint">
                        Chiffrée par le trousseau du système, jamais exposée à l’interface.
                      </p>
                      <div className="model-editor-actions">
                        <button type="button" className="action ghost" onClick={() => setEditing(null)}>
                          Annuler
                        </button>
                        <button type="button" className="action primary" onClick={() => void saveProvider(definition.id)}>
                          Enregistrer
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <p className="setting-hint model-foot">
          Aucune télémétrie. Une clé n’est utilisée que par l’agent, vers l’endpoint que vous voyez ci-dessus.
        </p>
      </section>
    </>
  )

  const renderAgent = () => (
    <>
      <section className="setting-block">
        <div className="setting-head">
          <h2>Mode</h2>
          <p>Le mode démo ne demande rien. Le mode connecté envoie le texte des onglets joints au modèle.</p>
        </div>
        <div className="agent-modes">
          <button
            type="button"
            className="agent-mode"
            data-active={agent.mode === 'demo'}
            onClick={() => setMode('demo')}
          >
            <span className="agent-mode-top">
              <Icon name="sparkles" size={15} />
              Démo locale
              {agent.mode === 'demo' && <Icon name="check" size={13} />}
            </span>
            <span className="agent-mode-detail">
              Rapports simulés à partir des titres. Aucune page, aucune clé ne quitte l’appareil.
            </span>
          </button>
          <button
            type="button"
            className="agent-mode"
            data-active={agent.mode === 'api'}
            onClick={() => setMode('api')}
          >
            <span className="agent-mode-top">
              <Icon name="globe" size={15} />
              Modèle connecté
              {agent.mode === 'api' && <Icon name="check" size={13} />}
            </span>
            <span className="agent-mode-detail">
              Le texte des onglets joints part vers l’endpoint que vous configurez.
            </span>
          </button>
        </div>

        {agent.mode === 'api' && !apiReady && (
          <div className="setting-warning">
            <Icon name="warning" size={14} />
            Sans clé pour {activeDefinition.label}, l’agent reste en mode démo.
          </div>
        )}

        <div className="agent-active">
          <span
            className="model-mark"
            style={{
              color: activeDefinition.color,
              background: `color-mix(in srgb, ${activeDefinition.color} 16%, transparent)`,
              borderColor: `color-mix(in srgb, ${activeDefinition.color} 30%, transparent)`
            }}
          >
            {activeDefinition.mark}
          </span>
          <div className="agent-active-copy">
            <strong>{activeDefinition.label}</strong>
            <span>
              {activeState.model} ·{' '}
              {activeState.hasKey || activeDefinition.local ? 'prêt' : 'clé manquante'}
            </span>
          </div>
          <button type="button" className="action" onClick={() => setPage('models')}>
            Gérer les modèles
          </button>
        </div>
      </section>

      <section className="setting-block">
        <div className="setting-head">
          <h2>Connexion</h2>
          <p>Endpoint et modèle du fournisseur actif.</p>
        </div>
        <div className="field-grid">
          <label className="field">
            <span>Endpoint</span>
            <input
              key={`${activeDefinition.id}-url`}
              defaultValue={activeState.baseUrl}
              onBlur={(event) => {
                const url = event.target.value.trim()
                if (!/^https?:\/\//i.test(url)) {
                  toast('L’endpoint doit commencer par http:// ou https://', 'error')
                  return
                }
                void updateSettings({ providers: { [activeDefinition.id]: { baseUrl: url } } })
              }}
              spellCheck={false}
            />
          </label>
          <label className="field">
            <span>Modèle</span>
            <input
              key={`${activeDefinition.id}-model`}
              defaultValue={activeState.model}
              onBlur={(event) => {
                const model = event.target.value.trim()
                if (!model) return
                void updateSettings({ providers: { [activeDefinition.id]: { model } } })
              }}
              spellCheck={false}
            />
          </label>
        </div>
        <p className="setting-hint">
          La clé se gère dans <button type="button" className="text-btn inline" onClick={() => setPage('models')}>Modèles</button>.
        </p>
      </section>
    </>
  )

  const renderPage = () => {
    switch (page) {
      case 'appearance':
        return (
          <section className="setting-block">
            <div className="setting-head">
              <h2>Thème</h2>
              <p>La transparence du châssis suit le fond et la lumière.</p>
            </div>
            <div className="theme-cards">
              {THEMES.map((theme) => (
                <button
                  type="button"
                  key={theme.value}
                  className="theme-card"
                  data-active={settings.theme === theme.value}
                  onClick={() => void updateSettings({ theme: theme.value })}
                >
                  <span className="theme-preview" data-theme-preview={theme.value}>
                    <span className="theme-preview-rail" />
                    <span className="theme-preview-side" />
                    <span className="theme-preview-pane" />
                  </span>
                  <span className="theme-copy">
                    <span className="theme-name">
                      <Icon name={theme.icon} size={14} />
                      {theme.label}
                      {settings.theme === theme.value && <Icon name="check" size={13} />}
                    </span>
                    <span className="theme-detail">{theme.detail}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        )

      case 'navigation':
        return (
          <>
            <section className="setting-block">
              <div className="setting-head">
                <h2>Recherche</h2>
                <p>Le moteur utilisé quand vous tapez une question.</p>
              </div>
              <div className="setting-row">
                <label htmlFor="engine">Moteur de recherche</label>
                <select
                  id="engine"
                  className="select"
                  value={settings.searchEngine}
                  onChange={(event) =>
                    void updateSettings({ searchEngine: event.target.value as SearchEngineId })
                  }
                >
                  {Object.entries(SEARCH_ENGINES).map(([id, engine]) => (
                    <option key={id} value={id}>
                      {engine.label}
                    </option>
                  ))}
                </select>
              </div>
            </section>

            <section className="setting-block">
              <div className="setting-head">
                <h2>Historique</h2>
                <p>{plural(view.history.length, 'entrée')} conservée{view.history.length > 1 ? 's' : ''} sur cet appareil.</p>
              </div>
              <div className="setting-row">
                <div>
                  <label>Effacer l’historique</label>
                  <p className="setting-hint">Le brief du jour et les suggestions repartent à zéro.</p>
                </div>
                <button
                  type="button"
                  className="action"
                  data-danger={confirmClear}
                  onClick={() => {
                    if (!confirmClear) {
                      setConfirmClear(true)
                      return
                    }
                    void useBrowser.getState().call(() => window.vela.history.clear(), 'Historique non effacé.')
                    setConfirmClear(false)
                    toast('Historique effacé.')
                  }}
                >
                  <Icon name="trash" size={13} />
                  {confirmClear ? 'Confirmer' : 'Effacer'}
                </button>
              </div>
            </section>
          </>
        )

      case 'privacy':
        return (
          <section className="setting-block">
            <div className="setting-head">
              <h2>Protection</h2>
              <p>Liste locale de domaines publicitaires et de mesure d’audience.</p>
            </div>
            <div className="setting-row">
              <div>
                <label>Bloquer les traqueurs</label>
                <p className="setting-hint">{view.blockedTotal} requêtes bloquées cette session.</p>
              </div>
              <button
                type="button"
                className="switch"
                role="switch"
                aria-checked={settings.blockTrackers}
                data-on={settings.blockTrackers}
                onClick={() => void updateSettings({ blockTrackers: !settings.blockTrackers })}
              >
                <span />
              </button>
            </div>
            <div className="setting-row">
              <div>
                <label>Permissions des pages</label>
                <p className="setting-hint">Caméra, micro, position et notifications sont refusés en v0.1.</p>
              </div>
              <span className="tag">Refusées</span>
            </div>
            <div className="glass-note">
              <Icon name="lock" size={14} />
              <span>Aucun compte, aucune synchronisation, aucune télémétrie.</span>
            </div>
          </section>
        )

      case 'models':
        return renderModels()

      case 'agent':
        return renderAgent()

      case 'notes':
        return (
          <section className="setting-block">
            <div className="setting-head">
              <h2>Fichiers</h2>
              <p>{plural(view.notes.length, 'note')} · sauvegarde immédiate, aucun serveur.</p>
            </div>
            <div className="setting-row">
              <div>
                <label>Dossier des notes</label>
                <p className="setting-hint">Du Markdown lisible par n’importe quelle autre app.</p>
              </div>
              <button type="button" className="action" onClick={() => void window.vela.notes.openFolder()}>
                <Icon name="folder" size={13} />
                Ouvrir
              </button>
            </div>
            <button type="button" className="action wide" onClick={() => void saveAgentNote()} disabled={!hasReport}>
              <Icon name="notes" size={13} />
              Enregistrer le dernier rapport de l’agent
            </button>
          </section>
        )

      case 'shortcuts':
        return (
          <section className="setting-block">
            <div className="shortcut-table">
              {SHORTCUTS.map(([label, keys]) => (
                <div className="shortcut-table-row" key={label}>
                  <span>{label}</span>
                  <kbd>{keys}</kbd>
                </div>
              ))}
            </div>
          </section>
        )

      case 'about': {
        const updateLabel =
          update?.state === 'checking'
            ? 'Vérification…'
            : update?.state === 'available'
              ? `Vela ${update.version ?? ''} — téléchargement en arrière-plan`
              : update?.state === 'downloading'
                ? `Téléchargement en arrière-plan ${update.progress}%`
                : update?.state === 'downloaded'
                  ? 'Prête — s’installe automatiquement à la fermeture'
                  : update?.state === 'not-available'
                    ? 'Vela est à jour'
                    : update?.state === 'error'
                      ? (update.message ?? 'Vérification impossible')
                      : 'Mises à jour automatiques en arrière-plan'
        return (
          <section className="setting-block">
            <div className="about-hero">
              <span className="about-mark">Vela</span>
              <div>
                <strong>Vela {update?.currentVersion || '0.1'}</strong>
                <p className="setting-hint">
                  Navigateur de travail — Electron, React et Chromium. Aucune télémétrie, aucun compte,
                  aucune synchronisation.
                </p>
              </div>
            </div>
            <div className="setting-row">
              <div>
                <strong>Mise à jour</strong>
                <p className="setting-hint">{updateLabel}</p>
                {update?.state === 'downloading' && (
                  <div className="update-progress" role="progressbar" aria-valuenow={update.progress} aria-valuemin={0} aria-valuemax={100}>
                    <span style={{ width: `${Math.min(100, Math.max(0, update.progress))}%` }} />
                  </div>
                )}
              </div>
              <div className="setting-actions">
                {update?.state === 'downloaded' ? (
                  <button type="button" className="action primary" onClick={() => void installUpdate()}>
                    <Icon name="download" size={15} />
                    Redémarrer maintenant
                  </button>
                ) : (
                  <button
                    type="button"
                    className="action"
                    onClick={() => void checkUpdate()}
                    disabled={update?.state === 'checking' || update?.state === 'downloading'}
                  >
                    <Icon name="reload" size={15} />
                    Vérifier
                  </button>
                )}
                <button type="button" className="action ghost" onClick={() => void openReleases()}>
                  <Icon name="external" size={14} />
                  Releases
                </button>
              </div>
            </div>
            <div className="about-grid">
              <div>
                <span>Agent</span>
                <strong>{apiReady ? `${activeDefinition.label} · ${activeState.model}` : 'Démo locale'}</strong>
              </div>
              <div>
                <span>Bloqueur</span>
                <strong>{settings.blockTrackers ? 'Actif' : 'Désactivé'}</strong>
              </div>
              <div>
                <span>Données</span>
                <strong>Sur cet appareil</strong>
              </div>
            </div>
          </section>
        )
      }

      default:
        return null
    }
  }

  return (
    <div className="overlay" onMouseDown={() => setOverlay(null)}>
      <div
        className="sheet settings-sheet"
        role="dialog"
        aria-label="Réglages"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="settings-layout">
          <aside className="settings-nav">
            <div className="settings-nav-brand">
              <span className="wordmark">
                Vela<span className="wordmark-dot">.</span>
              </span>
              <span className="settings-nav-version">0.1</span>
            </div>
            <div className="settings-nav-scroll">
              {NAV.map((group) => (
                <div className="settings-nav-group" key={group.group}>
                  <p className="settings-nav-label">{group.group}</p>
                  {group.items.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      className="settings-nav-item"
                      data-active={page === item.id}
                      onClick={() => setPage(item.id)}
                    >
                      <Icon name={item.icon} size={14} />
                      {item.label}
                    </button>
                  ))}
                </div>
              ))}
            </div>
            <div className="settings-nav-foot">
              <span className="privacy-dot" />
              Tout reste local
            </div>
          </aside>

          <div className="settings-pane">
            <header className="settings-head">
              <div>
                <h1>{COPY[page].title}</h1>
                <p>{COPY[page].lede}</p>
              </div>
              <button type="button" className="icon-btn" onClick={() => setOverlay(null)} title="Fermer">
                <Icon name="close" size={17} />
              </button>
            </header>
            <div className="settings-scroll">{renderPage()}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
