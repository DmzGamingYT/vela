import { useRef, useState } from 'react'
import {
  PROVIDERS,
  endpointHost,
  isLoopbackEndpoint,
  providerById,
  providerReady
} from '@shared/providers'
import { useModalFocus } from '../lib/useModalFocus'
import AboutPage from './AboutPage'
import AmbienceScene from './AmbienceScene'
import AppearancePage from './AppearancePage'
import NavigationPage from './NavigationPage'
import PrivacyPage from './PrivacyPage'
import UpdatesPage from './UpdatesPage'
import { BrandMark, PROVIDER_BRANDS, readableTint } from './BrandMark'
import { resolveMode, resolveThemeId, type HomeBackground } from '@shared/theme'
import type { AgentMode, ProviderId, ProviderSettings } from '@shared/types'
import { plural, shortcut, spokenShortcut, timeAgo } from '../lib/format'
import { useBrowser } from '../store/browser'
import { Icon, type IconName } from './Icon'

type Page =
  'appearance' | 'navigation' | 'privacy' | 'models' | 'notes' | 'shortcuts' | 'updates' | 'about'

const NAV: { group: string; items: { id: Page; label: string; icon: IconName }[] }[] = [
  {
    group: 'Navigateur',
    items: [
      { id: 'appearance', label: 'Apparence', icon: 'palette' },
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
      { id: 'updates', label: 'Mises à jour', icon: 'download' },
      { id: 'about', label: 'À propos', icon: 'circle' }
    ]
  }
]

const COPY: Record<Page, { title: string; lede: string }> = {
  appearance: { title: 'Apparence', lede: 'Mode, couleur, fond de l’accueil et accessibilité.' },
  navigation: {
    title: 'Navigation',
    lede: 'Recherche, démarrage, marque-pages, historique et téléchargements.'
  },
  privacy: {
    title: 'Confidentialité',
    lede: 'Le blocage se fait dans Chromium, avant le départ de la requête.'
  },
  models: { title: 'Modèles', lede: 'Le mode de l’agent, les fournisseurs et les clés associées.' },
  notes: {
    title: 'Notes',
    lede: 'Des fichiers Markdown que vous possédez, dans le dossier de données de Vela.'
  },
  shortcuts: {
    title: 'Raccourcis',
    lede: 'Tous les raccourcis fonctionnent depuis une page comme depuis l’interface.'
  },
  updates: {
    title: 'Mises à jour',
    lede: 'La version installée, le mode de lancement et l’installateur vérifié de la dernière release.'
  },
  about: { title: 'À propos', lede: 'Vela — Electron, React et Chromium.' }
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
      ['Atelier', shortcut('⇧A')],
      ['Sessions', shortcut('⇧B')],
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
  const toggleNotes = useBrowser((state) => state.toggleNotes)
  const hasReport = useBrowser((state) => Boolean(state.agent.markdown))
  const toast = useBrowser((state) => state.toast)
  const sheetRef = useModalFocus<HTMLDivElement>({ initialFocus: 'container' })

  const [page, setPage] = useState<Page>('appearance')
  const [editing, setEditing] = useState<ProviderId | null>(null)
  const [keyDraft, setKeyDraft] = useState('')
  const [modelDraft, setModelDraft] = useState('')
  const [urlDraft, setUrlDraft] = useState('')
  const [testing, setTesting] = useState<ProviderId | null>(null)
  const [shortcutQuery, setShortcutQuery] = useState('')
  const [navQuery, setNavQuery] = useState('')
  const navInput = useRef<HTMLInputElement | null>(null)
  const navGroups = NAV.map((group) => ({
    group: group.group,
    items: group.items.filter(
      (item) => !navQuery.trim() || normalize(item.label).includes(normalize(navQuery.trim()))
    )
  })).filter((group) => group.items.length > 0)

  if (!view) return null

  const settings = view.settings
  const activeSpace = view.spaces.find((item) => item.id === view.activeSpaceId) ?? null
  const mode = resolveMode(settings.theme, {
    hourTheme: settings.hourTheme,
    hourStart: settings.hourStart,
    hourEnd: settings.hourEnd,
    systemDark: window.matchMedia('(prefers-color-scheme: dark)').matches
  })
  // L'aperçu suit le thème effectif : celui de l'espace s'il en porte un.
  const previewThemeId = resolveThemeId({
    globalTheme: settings.themeId,
    perSpace: settings.perSpaceThemes,
    spaceTheme: activeSpace?.theme ?? null
  })
  const agent = settings.agent
  const activeDefinition = providerById(agent.provider)
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
    void updateSettings({
      themeId: 'indigo',
      customAccent: '#5b5bd6',
      glass: 'normal',
      glassBlur: 18,
      ambience: 'none',
      homeBackground: 'gradient',
      homeImage: null,
      homeBlur: 18,
      skyVariant: 'braise',
      density: 'normal',
      textSize: 'normal',
      sidebarSide: 'left',
      reduceMotion: 'system',
      highContrast: false,
      hourTheme: false,
      hourStart: 7,
      hourEnd: 19,
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
                    Rapports simulés à partir des titres de vos onglets. Aucune page ne quitte
                    l’appareil.
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
              <div
                className="model-item"
                key={definition.id}
                role="group"
                aria-label={`Fournisseur ${definition.label}`}
              >
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
                        {isActive && (
                          <em className="model-chip" data-accent="true">
                            Actif
                          </em>
                        )}
                      </span>
                      <span className="model-detail" data-tone={status.tone}>
                        {status.tone !== 'none' && <i className="model-dot" />}
                        {status.label}
                      </span>
                    </span>
                  </button>
                  <div className="model-actions">
                    {!state.hasKey && !definition.local && (
                      <a
                        className="ghost-btn"
                        href={definition.keyUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
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
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() => openEditor(definition.id)}
                    >
                      {state.hasKey
                        ? 'Modifier'
                        : definition.local
                          ? 'Configurer l’endpoint'
                          : 'Ajouter une clé'}
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
                          placeholder={
                            state.hasKey
                              ? 'Nouvelle clé (laisser vide pour conserver)'
                              : definition.keyLabel
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
                        {endpointHost(urlDraft) ?? urlDraft}. Les textes confiés à l’agent et
                        l’audio transcrit y seront envoyés.
                      </p>
                    )}
                    <div className="model-editor-foot">
                      <p className="setting-hint">
                        Chiffrée par le trousseau du système, jamais exposée à l’interface.
                      </p>
                      <div className="model-editor-actions">
                        <button
                          type="button"
                          className="action ghost"
                          onClick={() => setEditing(null)}
                        >
                          Annuler
                        </button>
                        <button
                          type="button"
                          className="action primary"
                          onClick={() => void saveProvider(definition.id)}
                        >
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
          Le comportement de l’agent suit toujours le modèle actif : il n’y a rien d’autre à régler
          ici. Aucune télémétrie, et une clé n’est utilisée que par l’agent, vers l’endpoint que
          vous voyez ci-dessus.
        </p>
      </section>
    </>
  )

  const renderPage = () => {
    switch (page) {
      case 'appearance':
        return (
          <AppearancePage
            settings={settings}
            mode={mode}
            previewThemeId={previewThemeId}
            updateSettings={updateSettings}
            chooseBackground={chooseBackground}
            resetAppearance={resetAppearance}
          />
        )

      case 'navigation':
        return (
          <NavigationPage
            settings={settings}
            updateSettings={updateSettings}
            onOpenPrivacy={() => setPage('privacy')}
            bookmarkCount={view.bookmarks.length}
            historyCount={view.history.length}
            downloadCount={view.downloads.length}
          />
        )

      case 'privacy':
        return <PrivacyPage settings={settings} onOpenNavigation={() => setPage('navigation')} />

      case 'models':
        return renderModels()

      case 'notes': {
        const openNotes = (): void => {
          setOverlay(null)
          toggleNotes(true)
        }
        const recent = [...view.notes].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6)
        return (
          <>
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
                <button
                  type="button"
                  className="action"
                  onClick={() => void window.vela.notes.openFolder()}
                >
                  <Icon name="folder" size={13} />
                  Ouvrir
                </button>
              </div>
              <button
                type="button"
                className="action wide"
                onClick={() => void saveAgentNote()}
                disabled={!hasReport}
              >
                <Icon name="notes" size={13} />
                Enregistrer le dernier rapport de l’agent
              </button>
            </section>

            {/* La page ne montrait qu'un compteur et un dossier : les dernières
                notes donnent une raison d'y venir et un chemin vers le tiroir. */}
            <section className="setting-block">
              <div className="setting-head">
                <h2>Notes récentes</h2>
                <p>
                  {recent.length === 0
                    ? 'Rien encore : le tiroir de notes garde les extraits d’une page en un clic.'
                    : 'Les six dernières, tous espaces confondus.'}
                </p>
              </div>
              {recent.length === 0 ? (
                <p className="setting-hint">
                  Chaque note reste un fichier <code>.md</code>, lisible sans Vela.
                </p>
              ) : (
                <ul className="settings-note-list">
                  {recent.map((note) => (
                    <li key={note.id}>
                      <button type="button" className="settings-note-row" onClick={openNotes}>
                        <Icon name={note.pinned ? 'star' : 'notes'} size={13} />
                        <span className="settings-note-copy">
                          <strong>{note.title || 'Note sans titre'}</strong>
                          <span>{note.preview || 'Note vide'}</span>
                        </span>
                        <span className="settings-note-date">{timeAgo(note.updatedAt)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button type="button" className="action wide" onClick={openNotes}>
                <Icon name="notes" size={13} />
                Ouvrir le tiroir de notes
              </button>
            </section>
          </>
        )
      }

      case 'shortcuts': {
        const search = normalize(shortcutQuery.trim())
        const query = (label: string, keys: string): string =>
          normalize(`${label} ${keys} ${spokenKeys(keys)}`)
        const groups = SHORTCUT_GROUPS.map((group) => ({
          title: group.title,
          items: group.items.filter(
            ([label, keys]) => !search || query(label, keys).includes(search)
          )
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
                      <kbd aria-label={spokenShortcut(keys)}>{keys}</kbd>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <p className="shortcut-note">
              Les combinaisons viennent du menu de l’application : cette version ne les remappe pas
              encore.
            </p>
          </section>
        )
      }

      case 'updates':
        return <UpdatesPage />

      case 'about':
        return <AboutPage onOpenUpdates={() => setPage('updates')} />

      default:
        return null
    }
  }

  return (
    <div className="overlay" onMouseDown={() => setOverlay(null)}>
      <div
        ref={sheetRef}
        className="sheet settings-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Réglages"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'f') return
          event.preventDefault()
          navInput.current?.focus()
        }}
      >
        {/* L’ambiance choisie joue aussi dans le panneau, derrière le verre.
            Elle est décorative et ne capte aucun clic. */}
        <AmbienceScene ambience={settings.ambience} className="ambience-panel" />
        <div className="settings-layout">
          <aside className="settings-nav">
            <div className="settings-nav-brand">
              <span className="wordmark" aria-hidden="true">
                Vela<span className="wordmark-dot">.</span>
              </span>
            </div>
            <div className="settings-nav-search">
              <Icon name="search" size={13} />
              <input
                ref={navInput}
                value={navQuery}
                onChange={(event) => setNavQuery(event.target.value)}
                placeholder="Chercher"
                aria-label="Chercher une section des réglages"
                spellCheck={false}
                onKeyDown={(event) => {
                  if (event.key !== 'Escape' || !navQuery) return
                  event.preventDefault()
                  setNavQuery('')
                }}
              />
              <kbd aria-hidden="true">{shortcut('F')}</kbd>
            </div>
            <nav className="settings-nav-scroll" aria-label="Sections des réglages">
              {navGroups.map((group) => (
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
          </aside>

          <div className="settings-pane">
            <header className="settings-head">
              <div>
                <h1>{COPY[page].title}</h1>
                <p>{COPY[page].lede}</p>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setOverlay(null)}
                title="Fermer"
              >
                <Icon name="close" size={17} />
              </button>
            </header>
            {/* La clé change la courbe d’entrée à chaque section : le panneau
                glisse sans faire sauter le défilement du parent. */}
            <div className="settings-scroll" key={page}>
              {renderPage()}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
