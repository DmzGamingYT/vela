import { useRef, useState, type KeyboardEvent } from 'react'
import {
  PROVIDERS,
  endpointHost,
  isLoopbackEndpoint,
  providerById,
  providerReady,
  providerState
} from '@shared/providers'
import type { AgentMode, ProviderId, ProviderSettings, Settings } from '@shared/types'
import { isHomeUrl } from '@shared/url'
import { useBrowser } from '../../store/browser'
import { BrandMark, PROVIDER_BRANDS, readableTint } from '../BrandMark'
import { Icon } from '../Icon'
import AgentNotesSection from './AgentNotesSection'
import { resolveTab } from './settingsSearch'

type Tab = 'model' | 'providers' | 'notes'

const TABS: { id: Tab; label: string }[] = [
  { id: 'model', label: 'Modèle actif' },
  { id: 'providers', label: 'Fournisseurs' },
  { id: 'notes', label: 'Notes' }
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

/**
 * Section Agent : le moteur actif, les fournisseurs et les notes. Les trois
 * anciennes pages Modèles et Notes vivent désormais sous ces onglets ; le
 * choix du fournisseur et l'éditeur de clé restent au même endroit.
 */
export default function AgentPage({
  settings,
  initialTab
}: {
  settings: Settings
  initialTab?: string
}) {
  const view = useBrowser((state) => state.view)
  const setOverlay = useBrowser((state) => state.setOverlay)
  const updateSettings = useBrowser((state) => state.updateSettings)
  const setKey = useBrowser((state) => state.setKey)
  const testKey = useBrowser((state) => state.testKey)
  const toggleAgent = useBrowser((state) => state.toggleAgent)
  const startAgent = useBrowser((state) => state.startAgent)
  const toast = useBrowser((state) => state.toast)

  const [tab, setTab] = useState<Tab>(() => resolveTab(initialTab, TABS, 'model'))
  const [editing, setEditing] = useState<ProviderId | null>(null)
  const [keyDraft, setKeyDraft] = useState('')
  const [modelDraft, setModelDraft] = useState('')
  const [urlDraft, setUrlDraft] = useState('')
  const [testing, setTesting] = useState<ProviderId | null>(null)
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({
    model: null,
    providers: null,
    notes: null
  })

  const agent = settings.agent
  const active = providerById(agent.provider)
  const activeState = providerState(settings)
  const activeStatus = statusOf(activeState, agent.provider)
  const ready = providerReady(settings)
  const demo = agent.mode === 'demo'
  const model = activeState.model.trim() || active.model

  const chooseTab = (next: Tab): void => {
    setTab(next)
    tabRefs.current[next]?.focus()
  }

  const tabKeys = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const last = TABS.length - 1
    let nextIndex: number
    if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = last
    else if (event.key === 'ArrowRight') nextIndex = index === last ? 0 : index + 1
    else if (event.key === 'ArrowLeft') nextIndex = index === 0 ? last : index - 1
    else return
    event.preventDefault()
    const next = TABS[nextIndex].id
    setTab(next)
    tabRefs.current[next]?.focus()
  }

  const edit = (id: ProviderId): void => {
    const state = agent.providers[id]
    setEditing((current) => (current === id ? null : id))
    setKeyDraft('')
    setModelDraft(state.model)
    setUrlDraft(state.baseUrl)
  }

  /** Depuis le modèle actif, ouvre l'éditeur du fournisseur dans son onglet. */
  const configure = (id: ProviderId): void => {
    const state = agent.providers[id]
    setEditing(id)
    setKeyDraft('')
    setModelDraft(state.model)
    setUrlDraft(state.baseUrl)
    chooseTab('providers')
  }

  const choose = (id: ProviderId): void => {
    void updateSettings({ agent: { provider: id, mode: 'api' } })
    edit(id)
  }

  const setMode = (mode: AgentMode): void => {
    void updateSettings({ agent: { mode } })
  }

  const save = async (id: ProviderId): Promise<void> => {
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

  const test = async (id: ProviderId): Promise<void> => {
    setTesting(id)
    const result = await testKey(id)
    setTesting(null)
    toast(result.message, result.ok ? 'info' : 'error')
  }

  /** Un vrai tour d'agent : c'est la seule preuve que le modèle sert. */
  const testInAgent = (): void => {
    const sources = (view?.tabs ?? [])
      .filter((tab) => !isHomeUrl(tab.url))
      .map((tab) => tab.id)
      .slice(0, 2)
    setOverlay(null)
    toggleAgent(true)
    void startAgent(
      'Réponds en une phrase : quel modèle es-tu ? Termine par le mot « prêt ».',
      sources,
      sources.length > 0 ? 'answer' : 'act'
    )
  }

  const editorFor = editing ? agent.providers[editing] : null
  const editorDefinition = editing ? providerById(editing) : null

  return (
    <div className="agent-page">
      <div className="agent-tabs" role="tablist" aria-label="Sous-sections de l’agent">
        {TABS.map((entry, index) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            id={`agent-tab-${entry.id}`}
            className="agent-tab"
            data-active={tab === entry.id}
            aria-selected={tab === entry.id}
            aria-controls={`agent-panel-${entry.id}`}
            tabIndex={tab === entry.id ? 0 : -1}
            ref={(node) => {
              tabRefs.current[entry.id] = node
            }}
            onClick={() => chooseTab(entry.id)}
            onKeyDown={(event) => tabKeys(event, index)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div
        className="agent-panel"
        id="agent-panel-model"
        role="tabpanel"
        aria-labelledby="agent-tab-model"
        hidden={tab !== 'model'}
      >
        <section
          className={`models-hero${ready ? ' is-ready' : ''}`}
          data-settings-anchor="agent-mode"
        >
          <span
            className="models-hero-mark"
            style={
              demo
                ? undefined
                : {
                    color: readableTint(active.color),
                    background: `color-mix(in srgb, ${readableTint(active.color)} 16%, transparent)`,
                    borderColor: `color-mix(in srgb, ${readableTint(active.color)} 30%, transparent)`
                  }
            }
          >
            {demo || !PROVIDER_BRANDS[active.id] ? (
              <Icon name="sparkles" size={20} />
            ) : (
              <BrandMark brand={PROVIDER_BRANDS[active.id]} size={22} />
            )}
          </span>
          <div className="models-hero-copy">
            <span className="models-hero-eyebrow">Moteur de l’agent</span>
            <strong>{demo ? 'Démo locale' : active.label}</strong>
            <span className="models-hero-detail">
              {demo
                ? 'Rapports simulés à partir des titres d’onglets. Rien ne quitte l’appareil.'
                : ready
                  ? `${model} · ${endpointHost(activeState.baseUrl) ?? 'endpoint local'}`
                  : `Aucune clé pour ${active.label} : l’agent reste en démo.`}
            </span>
          </div>
          <div className="models-hero-actions">
            <div className="models-mode" role="group" aria-label="Mode de l’agent">
              <button type="button" data-active={demo} onClick={() => setMode('demo')}>
                Démo
              </button>
              <button type="button" data-active={!demo} onClick={() => setMode('api')}>
                Modèle
              </button>
            </div>
            {ready && (
              <>
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => void test(agent.provider)}
                  disabled={testing !== null}
                  title="Interroge le fournisseur et vérifie que le modèle répond"
                >
                  {testing === agent.provider ? 'Test…' : 'Tester la clé'}
                </button>
                <button type="button" className="action primary" onClick={testInAgent}>
                  <Icon name="sparkles" size={13} />
                  Tester dans l’agent
                </button>
              </>
            )}
          </div>
        </section>

        <section className="setting-block" data-settings-anchor="agent-active-provider">
          <div className="setting-head">
            <h2>Accès au modèle</h2>
            <p>Le fournisseur, sa clé et son endpoint se règlent dans l’onglet Fournisseurs.</p>
          </div>
          <div className="setting-row">
            <div>
              <label>Fournisseur actif</label>
              <p className="setting-hint">
                {demo
                  ? 'Démo locale · aucun texte ne quitte l’appareil.'
                  : `${active.label} · ${activeStatus.label}`}
              </p>
            </div>
            <button type="button" className="action" onClick={() => configure(agent.provider)}>
              <Icon name="key" size={13} />
              Configurer
            </button>
          </div>
        </section>
      </div>

      <div
        className="agent-panel"
        id="agent-panel-providers"
        role="tabpanel"
        aria-labelledby="agent-tab-providers"
        hidden={tab !== 'providers'}
      >
        <section className="setting-block">
          <div className="setting-head">
            <h2>Fournisseurs</h2>
            <p>Une clé par fournisseur, gardée par le trousseau du système.</p>
          </div>

          <div className="provider-grid">
            {PROVIDERS.map((definition) => {
              const state = agent.providers[definition.id]
              const status = statusOf(state, definition.id)
              const isActive = agent.mode === 'api' && agent.provider === definition.id
              return (
                <button
                  key={definition.id}
                  type="button"
                  className="provider-card"
                  data-active={isActive}
                  data-tone={status.tone}
                  aria-pressed={isActive}
                  aria-label={`Utiliser ${definition.label} — ${status.label}`}
                  onClick={() => choose(definition.id)}
                >
                  <span
                    className="provider-mark"
                    style={{
                      color: readableTint(definition.color),
                      background: `color-mix(in srgb, ${readableTint(definition.color)} 16%, transparent)`,
                      borderColor: `color-mix(in srgb, ${readableTint(definition.color)} 30%, transparent)`
                    }}
                  >
                    {PROVIDER_BRANDS[definition.id] ? (
                      <BrandMark brand={PROVIDER_BRANDS[definition.id]} size={18} />
                    ) : (
                      definition.mark
                    )}
                  </span>
                  <span className="provider-copy">
                    <span className="provider-name">
                      {definition.label}
                      {isActive && (
                        <em className="model-chip" data-accent="true">
                          Actif
                        </em>
                      )}
                    </span>
                    <span className="provider-detail" data-tone={status.tone}>
                      {status.tone !== 'none' && <i className="model-dot" />}
                      {status.label}
                    </span>
                  </span>
                  <span className="provider-tail" aria-hidden="true">
                    <Icon name={state.hasKey || definition.local ? 'check' : 'plus'} size={13} />
                  </span>
                </button>
              )
            })}
          </div>

          {editorFor && editorDefinition && (
            <div className="model-editor is-standalone">
              <div className="model-editor-head">
                <strong>{editorDefinition.label}</strong>
                <span>{editorDefinition.detail}</span>
              </div>
              <div className="field-grid">
                <label className="field">
                  <span>
                    {editorDefinition.local ? 'Clé API (facultative)' : 'Clé API'}{' '}
                    {editorFor.hasKey && <em>· enregistrée</em>}
                  </span>
                  <input
                    type="password"
                    value={keyDraft}
                    onChange={(event) => setKeyDraft(event.target.value)}
                    placeholder={
                      editorFor.hasKey
                        ? 'Nouvelle clé (laisser vide pour conserver)'
                        : editorDefinition.keyLabel
                    }
                    spellCheck={false}
                    autoFocus
                  />
                </label>
                <label className="field">
                  <span>Modèle</span>
                  <input
                    value={modelDraft}
                    onChange={(event) => setModelDraft(event.target.value)}
                    placeholder={editorDefinition.model}
                    spellCheck={false}
                  />
                </label>
              </div>
              <label className="field model-endpoint">
                <span>Endpoint</span>
                <input
                  value={urlDraft}
                  onChange={(event) => setUrlDraft(event.target.value)}
                  placeholder={editorDefinition.baseUrl}
                  spellCheck={false}
                />
              </label>
              {editorDefinition.local && urlDraft.trim() && !isLoopbackEndpoint(urlDraft) && (
                <p className="setting-hint space-error" role="status">
                  <Icon name="warning" size={12} /> Cet endpoint n’est pas sur votre machine :{' '}
                  {endpointHost(urlDraft) ?? urlDraft}. Les textes confiés à l’agent y seront
                  envoyés.
                </p>
              )}
              <div className="model-editor-foot">
                <p className="setting-hint">
                  {editorFor.hasKey
                    ? 'Clé chiffrée par le trousseau du système, jamais exposée à l’interface.'
                    : editorDefinition.local
                      ? 'Aucune clé requise : seul l’endpoint compte.'
                      : 'La clé se crée sur la page du fournisseur, puis se colle ici.'}
                </p>
                <div className="model-editor-actions">
                  {!editorFor.hasKey && !editorDefinition.local && (
                    <a
                      className="action ghost"
                      href={editorDefinition.keyUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Icon name="external" size={13} />
                      Obtenir une clé
                    </a>
                  )}
                  {(editorFor.hasKey || editorDefinition.local) && (
                    <button
                      type="button"
                      className="action ghost"
                      onClick={() => void test(editorDefinition.id)}
                      disabled={testing !== null}
                    >
                      {testing === editorDefinition.id ? 'Test…' : 'Tester'}
                    </button>
                  )}
                  {editorFor.hasKey && (
                    <button
                      type="button"
                      className="action ghost danger"
                      title="Supprimer la clé enregistrée"
                      onClick={() => void setKey(editorDefinition.id, null)}
                    >
                      <Icon name="trash" size={13} />
                    </button>
                  )}
                  <button type="button" className="action ghost" onClick={() => setEditing(null)}>
                    Fermer
                  </button>
                  <button
                    type="button"
                    className="action primary"
                    onClick={() => void save(editorDefinition.id)}
                  >
                    Enregistrer
                  </button>
                </div>
              </div>
            </div>
          )}

          <p className="setting-hint model-foot">
            L’agent suit toujours le modèle actif : aucune autre option ici. Une clé n’est utilisée
            que pour l’agent et les notes, vers l’endpoint affiché plus haut.
          </p>
        </section>
      </div>

      <div
        className="agent-panel"
        id="agent-panel-notes"
        role="tabpanel"
        aria-labelledby="agent-tab-notes"
        hidden={tab !== 'notes'}
      >
        <AgentNotesSection />
      </div>
    </div>
  )
}
