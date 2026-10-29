import { useEffect, useState, type CSSProperties } from 'react'
import { LOCAL_ONLY, NETWORK_FLOWS, type NetworkFlow } from '@shared/network'
import { readWeatherPlace } from '@shared/place'
import { SEARCH_ENGINES } from '@shared/url'
import { updateActionLabel, updateDescription, updateNotice } from '@shared/update'
import {
  PROVIDERS,
  endpointHost,
  isLoopbackEndpoint,
  providerById,
  providerReady,
  providerState
} from '@shared/providers'
import { BrandMark, PROVIDER_BRANDS, VelaMark, readableTint } from './BrandMark'
import EnginePicker from './EnginePicker'
import {
  DRAGON_THEME,
  THEME_PRESETS,
  adjustAccent,
  parseHex,
  resolveMode,
  type GlassIntensity,
  type HomeBackground
} from '@shared/theme'
import type {
  AgentMode,
  ProviderId,
  ProviderSettings,
  SkyVariant,
  Theme
} from '@shared/types'
import { swatchColor } from '../lib/appearance'
import { plural, shortcut } from '../lib/format'
import { useBrowser } from '../store/browser'
import { clearFaviconMemo } from './Favicon'
import { Icon, type IconName } from './Icon'

type Page = 'appearance' | 'navigation' | 'privacy' | 'models' | 'notes' | 'shortcuts' | 'about'

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
      { id: 'models', label: 'Modèles', icon: 'key' },
      { id: 'notes', label: 'Notes', icon: 'notes' }
    ]
  },
  {
    group: 'Application',
    items: [
      { id: 'shortcuts', label: 'Raccourcis', icon: 'keyboard' },
      { id: 'about', label: 'À propos', icon: 'circle' }
    ]
  }
]

const COPY: Record<Page, { title: string; lede: string }> = {
  appearance: { title: 'Apparence', lede: 'Mode, thème de couleur et verre dépoli, réglés en direct.' },
  navigation: { title: 'Navigation', lede: 'Le moteur utilisé quand vous tapez une question, et la mémoire locale.' },
  privacy: { title: 'Confidentialité', lede: 'Le blocage se fait dans Chromium, avant le départ de la requête.' },
  models: { title: 'Modèles', lede: 'Le mode de l’agent, les fournisseurs et les clés associées.' },
  notes: { title: 'Notes', lede: 'Des fichiers Markdown que vous possédez, dans le dossier de données de Vela.' },
  shortcuts: { title: 'Raccourcis', lede: 'Tous les raccourcis fonctionnent depuis une page comme depuis l’interface.' },
  about: { title: 'À propos', lede: 'Vela — Electron, React et Chromium.' }
}

const SKY_OPTIONS: { value: SkyVariant; label: string; detail: string; icon: IconName }[] = [
  { value: 'braise', label: 'Braises', detail: 'Un dragon traverse le ciel, des braises montent.', icon: 'sparkles' },
  { value: 'westeros', label: 'Nuit de Westeros', detail: 'Un ciel étoilé, sa lune et le même dragon.', icon: 'moon' }
]

const GLASS_OPTIONS: { value: GlassIntensity; label: string }[] = [
  { value: 'light', label: 'Léger' },
  { value: 'normal', label: 'Normal' },
  { value: 'strong', label: 'Prononcé' }
]

const BACKGROUND_OPTIONS: { value: HomeBackground; label: string; icon: IconName }[] = [
  { value: 'gradient', label: 'Dégradé du thème', icon: 'sparkles' },
  { value: 'plain', label: 'Couleur unie', icon: 'circle' },
  { value: 'image', label: 'Image locale', icon: 'image' }
]

const THEMES: { value: Theme; label: string; detail: string; icon: IconName }[] = [
  { value: 'light', label: 'Clair', detail: 'Verre blanc sur ciel clair.', icon: 'sun' },
  { value: 'dark', label: 'Sombre', detail: 'Verre fumé sur nuit profonde.', icon: 'moon' },
  { value: 'system', label: 'Système', detail: 'Suit votre Mac ou Windows.', icon: 'monitor' }
]

type FlowTone = 'on' | 'off' | 'ask' | 'local'

interface FlowStateView {
  tone: FlowTone
  label: string
  note?: string
}

interface FlowContext {
  /** Ville validée pour la météo, null si aucune. */
  place: string | null
  engine: string
  agentMode: AgentMode
  providerLabel: string
  providerLocal: boolean
  providerBaseUrl: string
  providerLoopback: boolean
  providerReady: boolean
  tabs: number
  letterboxd: string
}

/**
 * L'état réel d'un flux, pas son état théorique : la météo n'est active que si
 * une ville existe, un modèle n'est actif que si une clé répond, Letterboxd
 * seulement si l'espace a un profil.
 */
function flowStateOf(flow: NetworkFlow, context: FlowContext): FlowStateView {
  switch (flow.id) {
    case 'meteo-ville':
    case 'meteo-releve':
      return context.place
        ? { tone: 'on', label: 'Actif', note: context.place }
        : { tone: 'off', label: 'Inactif', note: 'Aucune ville' }
    case 'moteur-connexion':
    case 'moteur-recherche':
      return { tone: 'on', label: 'Actif', note: context.engine }
    case 'tunnel-fournisseurs':
    case 'tunnel-pages':
      return { tone: 'ask', label: 'Sur demande', note: 'Quand vous lancez un tunnel' }
    case 'modeles':
      if (context.agentMode !== 'api') return { tone: 'off', label: 'Inactif', note: 'Mode démo local' }
      if (!context.providerReady) {
        return { tone: 'off', label: 'Inactif', note: `Clé manquante · ${context.providerLabel}` }
      }
      if (context.providerLocal && !context.providerLoopback) {
        return {
          tone: 'on',
          label: 'Hôte distant',
          note: endpointHost(context.providerBaseUrl) ?? context.providerLabel
        }
      }
      return context.providerLocal
        ? { tone: 'local', label: 'Local', note: context.providerLabel }
        : { tone: 'on', label: 'Actif', note: context.providerLabel }
    case 'modele-local':
      if (context.agentMode !== 'api' || !context.providerLocal) {
        return { tone: 'off', label: 'Inactif', note: 'Serveur local non choisi' }
      }
      if (!context.providerLoopback) {
        return {
          tone: 'ask',
          label: 'Hôte distant',
          note: endpointHost(context.providerBaseUrl) ?? 'Endpoint configuré'
        }
      }
      return { tone: 'local', label: 'Local', note: 'Rien ne quitte la machine' }
    case 'mises-a-jour':
      return { tone: 'on', label: 'Actif', note: 'Toutes les trois heures' }
    case 'bd-ocr':
      return { tone: 'ask', label: 'Sur demande', note: 'Traduction d’une planche' }
    case 'favicons':
      return { tone: 'on', label: 'Actif', note: 'Au premier affichage' }
    case 'letterboxd-journal':
      return context.letterboxd
        ? { tone: 'ask', label: 'Sur demande', note: `Profil ${context.letterboxd}` }
        : { tone: 'off', label: 'Inactif', note: 'Aucun profil dans cet espace' }
    case 'pages':
      return {
        tone: 'on',
        label: 'Actif',
        note: plural(context.tabs, 'onglet ouvert', 'onglets ouverts')
      }
    default:
      return { tone: 'ask', label: 'Sur demande' }
  }
}

/** Comparaison sans accent ni casse : « precedente » trouve « Précédente ». */
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

/** Les touches aussi se cherchent en mots : « cmd », « maj », « option ». */
function spokenKeys(keys: string): string {
  return keys
    .replace(/⌘/g, ' commande cmd ')
    .replace(/⇧/g, ' maj shift ')
    .replace(/⌥/g, ' option alt ')
    .replace(/⌫/g, ' retour arriere ')
}

const SHORTCUT_GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: 'Navigation',
    items: [
      ['Barre de commande', shortcut('K')],
      ['Barre d’adresse', shortcut('L')],
      ['Précédente', shortcut('[')],
      ['Suivante', shortcut(']')],
      ['Recharger', shortcut('R')],
      ['Rechercher dans la page', shortcut('F')],
      ['Imprimer', shortcut('P')]
    ]
  },
  {
    title: 'Onglets et pages',
    items: [
      ['Nouvel onglet', shortcut('T')],
      ['Fermer l’onglet', shortcut('W')],
      ['Rouvrir l’onglet', shortcut('⇧T')],
      ['Onglets 1 à 9', `${shortcut('1')} … ${shortcut('9')}`],
      ['Vue scindée', shortcut('⇧D')],
      ['Garder cette page', shortcut('D')],
      ['Historique', shortcut('Y')],
      ['Marque-pages', shortcut('⇧O')],
      ['Accueil', shortcut('⇧H')]
    ]
  },
  {
    title: 'Surfaces',
    items: [
      ['Notes', shortcut('E')],
      ['Agent', shortcut('J')],
      ['Travail', shortcut('⇧A')],
      ['Brief du jour', shortcut('⇧B')],
      ['Replier la barre latérale', shortcut('S')],
      ['Petite fenêtre', shortcut('⇧N')],
      ['Réglages', shortcut(',')]
    ]
  },
  {
    title: 'Lecture',
    items: [
      ['Zoom avant', shortcut('+')],
      ['Zoom arrière', shortcut('−')],
      ['Taille normale', shortcut('0')]
    ]
  }
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
  const [hexNote, setHexNote] = useState<{ text: string; tone: 'info' | 'error' } | null>(null)
  const [shortcutQuery, setShortcutQuery] = useState('')

  const [thumbCount, setThumbCount] = useState<number | null>(null)

  const refreshThumbs = async (): Promise<void> => {
    setThumbCount(await window.vela.thumbs.count().catch(() => 0))
  }

  const purgeThumbs = async (): Promise<void> => {
    const removed = await window.vela.thumbs.purge()
    setThumbCount(0)
    toast(removed > 0 ? plural(removed, 'vignette retirée', 'vignettes retirées') : 'Aucune vignette à retirer.')
  }

  useEffect(() => {
    if (page !== 'privacy') return
    void refreshThumbs()
  }, [page])

  const purgeFavicons = async (): Promise<void> => {
    const count = await window.vela.favicons.purge()
    clearFaviconMemo()
    toast(count > 0 ? plural(count, 'icône retirée', 'icônes retirées') : 'Le cache est déjà vide.')
  }

  if (!view) return null

  const settings = view.settings
  const mode = resolveMode(settings.theme, {
    hourTheme: settings.hourTheme,
    systemDark: window.matchMedia('(prefers-color-scheme: dark)').matches
  })
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

  const applyCustom = (value: string): void => {
    const parsed = parseHex(value)
    if (!parsed) {
      setHexNote({ text: 'Couleur invalide : utilisez un code #RRGGBB.', tone: 'error' })
      return
    }
    const result = adjustAccent(parsed, mode)
    void updateSettings({ customAccent: result.color, themeId: 'custom' })
    setHexNote(
      result.adjusted && result.reason
        ? { text: result.reason, tone: 'info' }
        : { text: 'Thème personnalisé appliqué.', tone: 'info' }
    )
  }

  const chooseBackground = async (value: HomeBackground): Promise<void> => {
    if (value !== 'image') {
      await updateSettings({ homeBackground: value })
      return
    }
    if (settings.homeImage) {
      await updateSettings({ homeBackground: 'image' })
      return
    }
    const picked = await window.vela.appearance.pickImage()
    if (!picked) {
      toast('Image non lue : choisissez un PNG, JPEG, WebP ou AVIF de moins de 8 Mo.', 'error')
      return
    }
    await updateSettings({ homeImage: picked.path, homeBackground: 'image' })
    toast('Image d’accueil appliquée.')
  }

  const resetAppearance = (): void => {
    setHexNote(null)
    void updateSettings({
      themeId: 'indigo',
      customAccent: '#5B5BD6',
      glass: 'normal',
      homeBackground: 'gradient',
      homeImage: null,
      homeBlur: 18,
      highContrast: false,
      hourTheme: false,
      perSpaceThemes: false
    })
    toast('Apparence réinitialisée.')
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
              <div className="model-item" key={definition.id} role="group" aria-label={`Fournisseur ${definition.label}`}>
                <div className="model-row" data-active={isActive} data-tone={status.tone}>
                  <button
                    type="button"
                    className="model-select"
                    onClick={() => chooseProvider(definition.id)}
                    aria-pressed={isActive}
                    // Le contenu du bouton ne dit que le nom du fournisseur :
                    // le nom accessible annonce l'action et l'état de la clé.
                    aria-label={`Utiliser ${definition.label} — ${status.label}`}
                    title={`Utiliser ${definition.label}`}
                  >
                    <span
                      className="model-mark"
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
                    {definition.local && urlDraft.trim() && !isLoopbackEndpoint(urlDraft) && (
                      <p className="setting-hint space-error" role="status">
                        <Icon name="warning" size={12} /> Cet endpoint n’est pas sur votre machine :{' '}
                        {endpointHost(urlDraft) ?? urlDraft}. Les textes confiés à l’agent et l’audio
                        transcrit y seront envoyés.
                      </p>
                    )}
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
        {agent.mode === 'api' && !apiReady && (
          <div className="setting-warning">
            <Icon name="warning" size={14} />
            Sans clé pour {activeDefinition.label}, l’agent reste en mode démo.
          </div>
        )}
        <p className="setting-hint model-foot">
          Le comportement de l’agent suit toujours le modèle actif : il n’y a rien d’autre à régler ici.
          Aucune télémétrie, et une clé n’est utilisée que par l’agent, vers l’endpoint que vous voyez ci-dessus.
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
              <h2>Mode</h2>
              <p>Clair, sombre, ou comme le système. Il se combine avec le thème de couleur.</p>
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
            <div className="setting-head accent-head">
              <h2>Thème de couleur</h2>
              <p>Une seule teinte, déclinée sur tout le châssis. Le contenu des sites n’est jamais recoloré.</p>
            </div>
            <div className="theme-swatches" role="group" aria-label="Thème de couleur">
              {THEME_PRESETS.map((preset) => {
                const active = settings.themeId === preset.id
                return (
                  <button
                    type="button"
                    key={preset.id}
                    aria-pressed={active}
                    aria-label={preset.label}
                    className="theme-tile"
                    data-active={active}
                    data-featured={preset.id === DRAGON_THEME}
                    style={{ '--swatch': swatchColor(preset.id, settings.customAccent, mode) } as CSSProperties}
                    onClick={() => void updateSettings({ themeId: preset.id })}
                  >
                    <span className="theme-tile-preview">
                      <span className="theme-tile-rail" />
                      <span className="theme-tile-side" />
                      <span className="theme-tile-pane">
                        <span className="theme-tile-dot" />
                      </span>
                    </span>
                    <span className="theme-tile-name">
                      {preset.label}
                      {active && <span className="theme-tile-badge" />}
                    </span>
                  </button>
                )
              })}
              {/* La teinte libre occupe sa propre rangée : les dix thèmes
                  remplissent deux rangées pleines, sans tuile orpheline, et
                  la couleur n'a qu'un seul endroit pour être réglée. */}
              <div className="theme-custom" data-active={settings.themeId === 'custom'}>
                <span
                  className="theme-custom-swatch"
                  style={{ '--swatch': settings.customAccent } as CSSProperties}
                  aria-hidden="true"
                />
                <div className="theme-custom-copy">
                  <span className="theme-custom-name">Personnalisé</span>
                  <span className="theme-custom-hint">Teinte libre, saisie ci-contre</span>
                </div>
                <div className="custom-color">
                  <input
                    type="color"
                    aria-label="Choisir une couleur personnalisée"
                    value={settings.customAccent}
                    onChange={(event) => applyCustom(event.target.value)}
                  />
                  <input
                    type="text"
                    aria-label="Code hexadécimal"
                    key={settings.customAccent}
                    defaultValue={settings.customAccent.toUpperCase()}
                    spellCheck={false}
                    onBlur={(event) => applyCustom(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        applyCustom(event.currentTarget.value)
                      }
                    }}
                  />
                </div>
                {settings.themeId === 'custom' ? (
                  <span className="theme-custom-state">
                    <Icon name="check" size={12} />
                    Active
                  </span>
                ) : (
                  <button
                    type="button"
                    className="action"
                    onClick={() => void updateSettings({ themeId: 'custom' })}
                  >
                    Utiliser
                  </button>
                )}
              </div>
            </div>

            {hexNote && (
              <p className="custom-color-note" data-tone={hexNote.tone}>
                {hexNote.text}
              </p>
            )}

            <div className="setting-head">
              <h2>Intensité du verre</h2>
              <p>Teinte et transparence du fond des panneaux.</p>
            </div>
            <div className="appearance-grid" role="radiogroup" aria-label="Intensité du verre">
              {GLASS_OPTIONS.map((option) => (
                <button
                  type="button"
                  key={option.value}
                  role="radio"
                  aria-checked={settings.glass === option.value}
                  className="appearance-choice"
                  data-active={settings.glass === option.value}
                  onClick={() => void updateSettings({ glass: option.value })}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="setting-head">
              <h2>Arrière-plan de l’accueil</h2>
              <p>Le dégradé suit le thème. Une image reste sur cet appareil.</p>
            </div>
            <div className="appearance-grid" role="radiogroup" aria-label="Arrière-plan de l’accueil">
              {BACKGROUND_OPTIONS.map((option) => (
                <button
                  type="button"
                  key={option.value}
                  role="radio"
                  aria-checked={settings.homeBackground === option.value}
                  className="appearance-choice"
                  data-active={settings.homeBackground === option.value}
                  onClick={() => void chooseBackground(option.value)}
                >
                  <Icon name={option.icon} size={13} />
                  {option.label}
                </button>
              ))}
            </div>
            {settings.homeBackground === 'image' && settings.homeImage && (
              <div className="setting-row">
                <div>
                  <label>Flou de l’image</label>
                  <p className="setting-hint">{settings.homeBlur} px · {settings.homeImage.split(/[\\/]/).pop()}</p>
                </div>
                <input
                  type="range"
                  min={0}
                  max={40}
                  step={1}
                  aria-label="Flou de l’image d’accueil"
                  value={settings.homeBlur}
                  onChange={(event) => void updateSettings({ homeBlur: Number(event.target.value) })}
                />
              </div>
            )}

            <div className="setting-head">
              <h2>Options</h2>
              <p>Accessibilité et variation automatique, sans changer de thème.</p>
            </div>
            <div className="setting-toggles">
              <div className="setting-row">
                <div>
                  <label>Ambiance du ciel</label>
                  <p className="setting-hint">
                    Deux ciels pour l’accueil, avec le thème Braise : braises et dragon, ou nuit étoilée.
                    « Réduire les animations » les fige.
                  </p>
                </div>
                <button
                  type="button"
                  className="switch"
                  role="switch"
                  aria-checked={settings.dragonSky}
                  data-on={settings.dragonSky}
                  aria-label="Ambiance du ciel"
                  onClick={() => void updateSettings({ dragonSky: !settings.dragonSky })}
                >
                  <span />
                </button>
              </div>
              <div className="setting-row" data-disabled={!settings.dragonSky}>
                <div>
                  <label>Ciel de l’accueil</label>
                  <p className="setting-hint">Le dragon passe dans les deux, plus haut que la carte météo.</p>
                </div>
                <div className="appearance-grid" role="radiogroup" aria-label="Ciel de l’accueil">
                  {SKY_OPTIONS.map((option) => (
                    <button
                      type="button"
                      key={option.value}
                      role="radio"
                      aria-checked={settings.skyVariant === option.value}
                      aria-label={`${option.label}. ${option.detail}`}
                      className="appearance-choice"
                      data-active={settings.skyVariant === option.value}
                      disabled={!settings.dragonSky}
                      onClick={() => void updateSettings({ skyVariant: option.value })}
                    >
                      <Icon name={option.icon} size={13} />
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="setting-row">
                <div>
                  <label>Contraste élevé</label>
                  <p className="setting-hint">Bordures renforcées, transparences supprimées.</p>
                </div>
                <button
                  type="button"
                  className="switch"
                  role="switch"
                  aria-checked={settings.highContrast}
                  data-on={settings.highContrast}
                  onClick={() => void updateSettings({ highContrast: !settings.highContrast })}
                >
                  <span />
                </button>
              </div>
              <div className="setting-row">
                <div>
                  <label>Thème selon l’heure</label>
                  <p className="setting-hint">Clair de 7 h à 19 h, sombre le soir, avec la même couleur.</p>
                </div>
                <button
                  type="button"
                  className="switch"
                  role="switch"
                  aria-checked={settings.hourTheme}
                  data-on={settings.hourTheme}
                  onClick={() => void updateSettings({ hourTheme: !settings.hourTheme })}
                >
                  <span />
                </button>
              </div>
              <div className="setting-row">
                <div>
                  <label>Un thème par espace</label>
                  <p className="setting-hint">
                    Chaque espace garde son thème ; sinon le thème global s’applique. Voir Modifier un espace.
                  </p>
                </div>
                <button
                  type="button"
                  className="switch"
                  role="switch"
                  aria-checked={settings.perSpaceThemes}
                  data-on={settings.perSpaceThemes}
                  onClick={() => void updateSettings({ perSpaceThemes: !settings.perSpaceThemes })}
                >
                  <span />
                </button>
              </div>
            </div>

            <button type="button" className="action wide" onClick={resetAppearance}>
              <Icon name="refresh" size={13} />
              Réinitialiser l’apparence
            </button>
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
              <div className="setting-row setting-row-stacked">
                <span className="setting-label" id="engine-label">
                  Moteur de recherche
                </span>
                <EnginePicker
                  value={settings.searchEngine}
                  onChange={(id) => void updateSettings({ searchEngine: id })}
                  labelledBy="engine-label"
                  compact
                />
              </div>
              {settings.searchEngine === 'searxng' && (
                <label className="field">
                  <span>Instance SearXNG</span>
                  <input
                    key={settings.searxInstance}
                    defaultValue={settings.searxInstance}
                    placeholder="searx.be"
                    spellCheck={false}
                    autoComplete="off"
                    onBlur={(event) => void updateSettings({ searxInstance: event.target.value.trim() })}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        void updateSettings({ searxInstance: event.currentTarget.value.trim() })
                      }
                    }}
                  />
                  <small className="setting-hint">Votre instance, ou searx.be si le champ reste vide.</small>
                </label>
              )}
            </section>

            <section className="setting-block">
              <div className="setting-head">
                <h2>Marque-pages</h2>
                <p>{plural(view.bookmarks.length, 'page')} gardée{view.bookmarks.length > 1 ? 's' : ''} sur cet appareil.</p>
              </div>
              <div className="setting-row">
                <div>
                  <label>Vos pages gardées</label>
                  <p className="setting-hint">⌘D garde la page affichée, ⇧⌘O ouvre la liste.</p>
                </div>
                <button type="button" className="action" onClick={() => setOverlay('bookmarks')}>
                  <Icon name="star" size={14} /> Gérer
                </button>
              </div>
            </section>

            <section className="setting-block">
              <div className="setting-head">
                <h2>Historique</h2>
                <p>{plural(view.history.length, 'entrée')} conservée{view.history.length > 1 ? 's' : ''} sur cet appareil.</p>
              </div>
              <div className="setting-row">
                <div>
                  <label>Consulter l’historique</label>
                  <p className="setting-hint">Par jour, avec suppression entrée par entrée.</p>
                </div>
                <button type="button" className="action" onClick={() => setOverlay('history')}>
                  <Icon name="history" size={14} /> Ouvrir
                </button>
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
            <div className="setting-row setting-row-top">
              <div>
                <label id="block-level-label">Niveau de blocage</label>
                <p className="setting-hint">
                  {view.blockedTotal} requêtes arrêtées cette session.{' '}
                  {!settings.blockTrackers
                    ? 'Rien n’est filtré pour l’instant.'
                    : settings.blockLevel === 'strict'
                      ? 'Renforcé : les scripts et cadres d’un autre site sont arrêtés aussi.'
                      : 'Standard : la liste locale de publicités et de traqueurs.'}
                </p>
              </div>
              <div className="segmented" role="radiogroup" aria-labelledby="block-level-label">
                {[
                  { id: 'off', label: 'Aucun' },
                  { id: 'trackers', label: 'Traqueurs' },
                  { id: 'strict', label: 'Renforcé' }
                ].map((entry) => {
                  const current = !settings.blockTrackers
                    ? 'off'
                    : settings.blockLevel === 'strict'
                      ? 'strict'
                      : 'trackers'
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      role="radio"
                      aria-checked={current === entry.id}
                      className="segment"
                      data-active={current === entry.id}
                      onClick={() => {
                        if (entry.id === 'off') void updateSettings({ blockTrackers: false })
                        else void updateSettings({ blockTrackers: true, blockLevel: entry.id as 'trackers' | 'strict' })
                      }}
                    >
                      {entry.label}
                    </button>
                  )
                })}
              </div>
            </div>
            {(() => {
              const domains = new Set(
                view.tabs.flatMap((tab) => tab.blockedHosts.map((entry) => entry.host))
              ).size
              return (
                <div
                  className="protection-stats"
                  role="group"
                  aria-label="Statistiques du bloqueur depuis le lancement"
                >
                  <div>
                    <span className="protection-stat-value">{view.blockedTotal}</span>
                    <span className="protection-stat-label">Requêtes arrêtées</span>
                  </div>
                  <div>
                    <span className="protection-stat-value">{domains}</span>
                    <span className="protection-stat-label">Domaines concernés</span>
                  </div>
                  <div>
                    <span className="protection-stat-value">
                      {view.tabs.filter((tab) => tab.blocked > 0).length}
                    </span>
                    <span className="protection-stat-label">Onglets filtrés</span>
                  </div>
                </div>
              )
            })()}
            <div className="setting-row">
              <div>
                <label>Permissions des pages</label>
                <p className="setting-hint">Caméra, micro, position et notifications sont refusés par défaut.</p>
              </div>
              <span className="tag">Refusées</span>
            </div>
            <div className="setting-row">
              <div>
                <label>Vignettes des pages récentes</label>
                <p className="setting-hint">
                  Une capture réduite à la fermeture de l’onglet, gardée dans le dossier de données.
                  Désactivé par défaut ; rien n’est capturé pour un espace privé ou une page en erreur.
                  {thumbCount !== null ? ` ${plural(thumbCount, 'vignette sur cet appareil')}.` : ''}
                </p>
              </div>
              <div className="setting-actions">
                <button type="button" className="action" onClick={() => void purgeThumbs()}>
                  <Icon name="trash" size={13} />
                  Vider
                </button>
                <button
                  type="button"
                  className="switch"
                  role="switch"
                  aria-checked={settings.thumbnails}
                  data-on={settings.thumbnails}
                  aria-label="Vignettes des pages récentes"
                  onClick={() => {
                    void updateSettings({ thumbnails: !settings.thumbnails })
                    void refreshThumbs()
                  }}
                >
                  <span />
                </button>
              </div>
            </div>
            <div className="setting-row">
              <div>
                <label>Icônes de sites</label>
                <p className="setting-hint">
                  Une requête par domaine, gardée sept jours sur l’appareil. Vider force la prochaine demande.
                </p>
              </div>
              <button type="button" className="action" onClick={() => void purgeFavicons()}>
                <Icon name="trash" size={13} />
                Vider le cache
              </button>
            </div>
            <div className="glass-note">
              <Icon name="lock" size={14} />
              <span>Aucun compte, aucune synchronisation, aucune télémétrie.</span>
            </div>

            <div className="setting-head flow-head">
              <h2>Ce qui quitte l’appareil</h2>
              <p>
                Les requêtes que Vela déclenche elle-même, hors pages que vous ouvrez : ce qui les
                déclenche, ce qu’elles emportent, et leur état maintenant.
              </p>
            </div>
            {(() => {
              const space = view.spaces.find((item) => item.id === view.activeSpaceId)
              const context: FlowContext = {
                place: readWeatherPlace()?.name ?? null,
                engine: SEARCH_ENGINES[settings.searchEngine]?.label ?? 'Moteur choisi',
                agentMode: agent.mode,
                providerLabel: activeDefinition.label,
                providerLocal: Boolean(activeDefinition.local),
                providerBaseUrl: activeState.baseUrl,
                providerLoopback: isLoopbackEndpoint(activeState.baseUrl),
                providerReady: apiReady,
                tabs: view.tabs.length,
                letterboxd: space?.letterboxd ?? ''
              }
              const rows = NETWORK_FLOWS.map((flow) => ({ flow, state: flowStateOf(flow, context) }))
              const count = (tone: FlowTone): number =>
                rows.filter((row) => row.state.tone === tone).length
              return (
                <>
                  <p className="flow-summary" role="status">
                    <span>{NETWORK_FLOWS.length} flux</span>
                    <span>{count('on')} actifs</span>
                    <span>{count('ask')} sur demande</span>
                    <span>{count('off')} inactifs</span>
                    {count('local') > 0 && <span>{count('local')} local</span>}
                  </p>
                  <table className="flow-table">
                    <caption className="sr-only">
                      Destinations réseau de Vela, avec leur état au moment où cette page est ouverte
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Flux</th>
                        <th scope="col">Déclencheur</th>
                        <th scope="col">Envoyé</th>
                        <th scope="col">État</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(({ flow, state }) => (
                        <tr key={flow.id} data-tone={state.tone} data-local={flow.local ? 'true' : undefined}>
                          <th scope="row">
                            <strong>{flow.label}</strong>
                            <span className="flow-target">{flow.target}</span>
                          </th>
                          <td>{flow.trigger}</td>
                          <td>{flow.data}</td>
                          <td>
                            <span className="flow-state" data-tone={state.tone}>
                              <i aria-hidden="true" />
                              {state.label}
                            </span>
                            {state.note && <span className="flow-state-note">{state.note}</span>}
                            {flow.off && <span className="flow-avoid">Pour l’éviter : {flow.off}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )
            })()}

            <div className="setting-head flow-head">
              <h2>Ce qui ne sort jamais</h2>
              <p>Ces données restent sur le disque, sans requête pour les déposer ailleurs.</p>
            </div>
            <ul className="flow-local-list">
              {LOCAL_ONLY.map((item) => (
                <li key={item}>
                  <Icon name="check" size={13} />
                  {item}
                </li>
              ))}
            </ul>
            <p className="setting-hint flow-note">
              Les pages que vous ouvrez sortent par définition : Vela ne fait que les demander, comme
              tout navigateur. En mode démo, l’agent ne contacte aucun modèle.
            </p>
          </section>
        )

      case 'models':
        return renderModels()

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

      case 'shortcuts': {
        const search = normalize(shortcutQuery.trim())
        const query = (label: string, keys: string): string =>
          normalize(`${label} ${keys} ${spokenKeys(keys)}`)
        const groups = SHORTCUT_GROUPS.map((group) => ({
          title: group.title,
          items: group.items.filter(([label, keys]) => !search || query(label, keys).includes(search))
        })).filter((group) => group.items.length > 0)
        const total = groups.reduce((count, group) => count + group.items.length, 0)
        const all = SHORTCUT_GROUPS.reduce((count, group) => count + group.items.length, 0)
        return (
          <section className="setting-block">
            <div className="shortcut-toolbar">
              <input
                className="shortcut-search"
                value={shortcutQuery}
                onChange={(event) => setShortcutQuery(event.target.value)}
                placeholder="Filtrer les raccourcis"
                aria-label="Filtrer les raccourcis"
                spellCheck={false}
                onKeyDown={(event) => {
                  // Échap vide le filtre sans quitter les réglages.
                  if (event.key !== 'Escape' || !shortcutQuery) return
                  event.preventDefault()
                  setShortcutQuery('')
                }}
              />
              <button
                type="button"
                className="action"
                onClick={() => setShortcutQuery('')}
                disabled={!search}
                title={search ? 'Effacer le filtre' : 'Aucun filtre actif'}
              >
                <Icon name="reload" size={13} />
                Réinitialiser
              </button>
            </div>
            <p className="shortcut-count" role="status">
              {search
                ? `${total} sur ${all} raccourcis`
                : `${all} raccourcis, en ${SHORTCUT_GROUPS.length} groupes`}
            </p>
            {total === 0 && <p className="shortcut-empty">Aucun raccourci ne correspond.</p>}
            {groups.map((group) => (
              <div className="shortcut-group" key={group.title}>
                <h3 className="shortcut-group-title">
                  {group.title}
                  <span className="shortcut-group-count">{group.items.length}</span>
                </h3>
                <div className="shortcut-table">
                  {group.items.map(([label, keys]) => (
                    <div className="shortcut-table-row" key={label}>
                      <span>{label}</span>
                      <kbd aria-label={keys.replace('⌘', 'Commande ').replace('⇧', 'Maj ')}>{keys}</kbd>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <p className="shortcut-note">
              Les combinaisons viennent du menu de l’application : cette version ne les remappe pas encore.
            </p>
          </section>
        )
      }

      case 'about': {
        const isMac = window.vela.platform === 'darwin'
        const updateLabel = updateDescription(update, isMac)
        const notice = updateNotice(update, isMac)
        return (
          <section className="setting-block">
            <div className="about-hero">
              <VelaMark size={52} brand />
              <div>
                <strong className="about-name">
                  Vela<span aria-hidden="true">.</span>
                </strong>
                <p className="about-tagline">Le web, votre atelier.</p>
                <p className="about-meta">
                  Navigateur de travail · macOS, Windows, Linux
                  <br />
                  Gratuit · Libre (MIT) · Sans compte
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
                {update?.state === 'downloaded' && notice?.action ? (
                  <button type="button" className="action primary" onClick={() => void installUpdate()}>
                    <Icon name={notice.action === 'install' ? 'download' : 'reload'} size={15} />
                    {updateActionLabel(notice.action)}
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
                <strong>
                  {!settings.blockTrackers
                    ? 'Désactivé'
                    : settings.blockLevel === 'strict'
                      ? 'Renforcé'
                      : 'Traqueurs'}
                </strong>
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
              <span className="brand-lockup" aria-label="Vela">
                <VelaMark size={19} />
                <span className="wordmark" aria-hidden="true">
                  Vela<span className="wordmark-dot">.</span>
                </span>
              </span>
              <span className="settings-nav-version" title={`Vela ${update?.currentVersion ?? ''}`}>
                {update?.currentVersion ?? ''}
              </span>
            </div>
            <nav className="settings-nav-scroll" aria-label="Sections des réglages">
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
            </nav>
            <div className="settings-nav-foot">
              <span className="privacy-dot" />
              <button type="button" className="settings-nav-foot-link" onClick={() => setPage('privacy')}>
                Ce qui reste local, ce qui sort
              </button>
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
            {/* La clé remonte le panneau à chaque section : l’animation d’entrée
                signale le changement sans faire sauter le défilement du parent. */}
            <div className="settings-scroll" key={page}>
              {renderPage()}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
