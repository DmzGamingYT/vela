import type { NoteGraph } from './noteLinks'
import type { MapNode, TunnelMap, TunnelMapSummary } from './tunnel'
import type {
  AgentEvent,
  AgentMode,
  AgentRunRequest,
  AppView,
  BookmarkImportSource,
  HistoryEntry,
  LayoutRequest,
  PeekState,
  Note,
  PageHighlight,
  PaneSnapshot,
  ProviderId,
  SelectionPayload,
  Settings,
  ShortcutEvent,
  TabGroup,
  TabState
} from './types'

export interface CreateTabInput {
  spaceId?: string
  url?: string
  activate?: boolean
  pinned?: boolean
  groupId?: string
}

export interface ReorderTabsInput {
  id: string
  targetId?: string | null
  position?: 'before' | 'after'
  groupId?: string | null
  /** Change l'état épinglé ↔ normal en même temps que la position. */
  pinned?: boolean
}

export interface CreateGroupInput {
  name?: string
  color?: string
  tabId?: string
}

export interface UpdateGroupInput {
  id: string
  name?: string
  color?: string
  collapsed?: boolean
}

export interface CreateSpaceInput {
  name: string
  color: string
  avatar?: string | null
  background?: import('./space').SpaceBackground
  shortcuts?: import('./space').SpaceShortcut[]
  watchlist?: boolean
  letterboxd?: string | null
  watchItems?: import('./space').SpaceWatchItem[]
  blockTrackers?: boolean
  theme?: string | null
  /** Teinte propre à l'espace : remplace l'accent, pas le papier. */
  accent?: string | null
}

export interface UpdateSpaceInput {
  id: string
  name?: string
  color?: string
  theme?: string | null
  accent?: string | null
  avatar?: string | null
  background?: import('./space').SpaceBackground
  shortcuts?: import('./space').SpaceShortcut[]
  watchlist?: boolean
  letterboxd?: string | null
  watchItems?: import('./space').SpaceWatchItem[]
  blockTrackers?: boolean
}

export interface SaveNoteInput {
  id?: string
  title: string
  body: string
  spaceId?: string
  url?: string
  tags?: string[]
  pinned?: boolean
}

/**
 * Charges partagées entre les trois côtés.
 *
 * Elles vivent ici, et non dans `src/main/ipc` : le renderer les emploie pour
 * appeler, le preload pour transmettre, le processus principal pour valider
 * (`shape<T>` dans `ipc/contract.ts`). Changer un champ ici casse la
 * compilation du côté qui n'a pas suivi — c'est le but de tout ce fichier.
 */

/** Charge de `notes:patch` : seul l'identifiant est obligatoire. */
export interface NotePatchInput {
  id: string
  title?: string
  pinned?: boolean
  tags?: string[]
}

/** Charge de `notes:rename` : le nouveau titre est réécrit dans les liens. */
export interface NoteRenameInput {
  id: string
  title: string
}

/** Charge de `notes:audio-save` : sans espace, l'espace actif est pris. */
export interface NoteAudioSaveInput {
  spaceId?: string
  dataUrl: string
}

/** Charge de `notes:transcribe` : le consentement distant est explicite. */
export interface NoteTranscribeInput {
  name: string
  consent: boolean
}

/** Charge de `tasks:create` : une échéance absente vaut « aucune ». */
export interface TaskCreateInput {
  title: string
  dueAt?: number | null
}

/** Charge de `tunnel:rename`. */
export interface TunnelRenameInput {
  id: string
  title: string
}

/** Charge de `tunnel:save-png`. */
export interface TunnelSavePngInput {
  dataUrl: string
  name: string
}

/** Charge de `tunnel:export-pdf`. */
export interface TunnelExportPdfInput {
  html: string
  name: string
}

/** Entrée de marque-page, telle qu'elle traverse l'IPC. */
export interface BookmarkEntry {
  url: string
  title?: string
  favicon?: string
}

/** Charge de `bookmark:toggle`. */
export type BookmarkToggleInput = BookmarkEntry

/** Charge de `bookmark:move`. */
export interface BookmarkMoveInput {
  id: string
  position: number
}

/** Charge de `peek:open` : sans adresse, la carte ouvre son champ. */
export interface PeekOpenInput {
  url?: string
  spaceId?: string
}

export type NoteAiAction =
  'generate' | 'reformulate' | 'summarize' | 'translate' | 'correct' | 'beautify'

export interface NoteAiInput {
  action: NoteAiAction
  body?: string
  title?: string
  url?: string
}

export interface NoteAiResult {
  text: string
  /** api = modèle configuré ; demo = repli local clairement étiqueté. */
  mode: 'api' | 'demo'
}

export interface ProviderPatch {
  model?: string
  baseUrl?: string
}

export interface SettingsPatch {
  theme?: Settings['theme']
  searchEngine?: Settings['searchEngine']
  customEngineId?: string
  customEngines?: Settings['customEngines']
  searchKeywords?: Settings['searchKeywords']
  searxInstance?: string
  startupBehavior?: Settings['startupBehavior']
  startupUrl?: string
  newTabBlank?: boolean
  historyRetention?: Settings['historyRetention']
  updateChecks?: Settings['updateChecks']
  downloadDir?: string | null
  askDownloadLocation?: boolean
  openAfterDownload?: boolean
  webLanguage?: string
  defaultZoom?: number
  themeId?: Settings['themeId']
  customAccent?: string
  accentOverride?: boolean
  glass?: Settings['glass']
  glassBlur?: Settings['glassBlur']
  ambience?: Settings['ambience']
  ambienceScope?: Settings['ambienceScope']
  ambienceIntensity?: Settings['ambienceIntensity']
  homeBackground?: Settings['homeBackground']
  homeIntensity?: Settings['homeIntensity']
  homeImage?: string | null
  homeBlur?: number
  skyVariant?: Settings['skyVariant']
  density?: Settings['density']
  textSize?: Settings['textSize']
  sidebarSide?: Settings['sidebarSide']
  highContrast?: boolean
  reduceMotion?: Settings['reduceMotion']
  hourTheme?: boolean
  hourStart?: Settings['hourStart']
  hourEnd?: Settings['hourEnd']
  perSpaceThemes?: boolean
  blockTrackers?: boolean
  blockLevel?: 'trackers' | 'strict'
  thumbnails?: boolean
  sidebarCollapsed?: boolean
  onboarded?: boolean
  agent?: { mode?: AgentMode; provider?: ProviderId }
  providers?: Partial<Record<ProviderId, ProviderPatch>>
}

export interface SetKeyInput {
  provider: ProviderId
  key: string | null
}

export interface KeyTestResult {
  ok: boolean
  message: string
}

export interface TunnelRunInput {
  query: string
  spaceId?: string
  /** Relance ciblée depuis un nœud existant. */
  parentId?: string
  mapId?: string
  /** quick | standard | deep : visée de pages lues. */
  depth?: 'quick' | 'standard' | 'deep'
  /** Variantes validées ou modifiées par l'utilisateur. */
  variants?: string[]
  /** Ajoute à la carte existante sans effacer les statuts. */
  more?: boolean
}

export type TunnelEvent =
  | {
      runId: string
      type: 'start'
      mapId: string
      query: string
      suggestedQuery: string | null
      privacy: 'local-analysis'
    }
  | { runId: string; type: 'node'; node: MapNode }
  | { runId: string; type: 'phase'; message: string }
  | {
      runId: string
      type: 'done'
      mapId: string
      summary: TunnelMapSummary
      sources: number
      nodes: number
      /** false quand le plafond de cartes empêche l'enregistrement. */
      saved: boolean
    }
  | { runId: string; type: 'error'; message: string }

export type UpdateState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'cancelled'
  | 'not-available'
  | 'error'

/** Mode d'installation qui porte la mise à jour. */
export type UpdateChannel = 'mac' | 'windows' | 'appimage' | 'linux-package' | 'other'

export interface UpdateInfo {
  state: UpdateState
  version: string | null
  currentVersion: string
  progress: number
  message: string | null
  releaseUrl: string
  /** Détecté au démarrage : AppImage, paquet Linux, macOS, Windows. */
  channel?: UpdateChannel
  /** Chemin de l'AppImage courante, quand l'app en est une. */
  appImagePath?: string | null
  /** false quand l'AppImage est dans un dossier en lecture seule. */
  appImageWritable?: boolean
}

/** API exposée à la fenêtre par le preload. Aucun accès Node dans le renderer. */
export interface ComicRunResult {
  ok: boolean
  reason?: string
}

export interface NoteRenameResult {
  note: Note
  previous: string
  /** Nombre de notes dont les liens ont suivi le renommage. */
  updated: number
}

export interface NoteTranscriptionResult {
  ok: boolean
  text?: string
  mode?: 'local' | 'cloud'
  reason?: 'local-required' | 'consent-required' | 'unavailable' | 'failed'
  /** Message lisible, jamais une trace technique. */
  detail?: string
}

export interface LetterboxdImportResult {
  ok: boolean
  /** Entrées du journal gardées après l'import (0 en cas d'échec). */
  count: number
  /** Horodatage du dernier import réussi, null sinon. */
  at: number | null
  reason?:
    'no-space' | 'no-profile' | 'not-found' | 'private' | 'offline' | 'timeout' | 'empty' | 'failed'
}

export interface VelaApi {
  platform: string
  /** Architecture du processus (arm64, x64) — utile pour le bundle universel. */
  arch: string
  view(): Promise<AppView>
  /** Photos d'avatar stockées sur disque, jamais en base64 dans vela.json. */
  avatars: {
    /** Data URL de la photo, ou null si le fichier a disparu. */
    read(name: string): Promise<string | null>
  }
  /** Journal Letterboxd, lu depuis le flux RSS public du profil. */
  letterboxd: {
    /**
     * Demande `letterboxd.com/<profil>/rss/` et garde le journal dans l'espace.
     * Sortie réseau unique, décrite dans l'audit et la page Confidentialité.
     */
    import(spaceId: string): Promise<LetterboxdImportResult>
  }
  /** Vignettes des pages récentes, en fichiers locaux. */
  thumbs: {
    /** Data URL de la vignette d'une adresse, ou null si absente ou désactivée. */
    get(url: string): Promise<string | null>
    count(): Promise<number>
    /** Supprime toutes les vignettes ; renvoie le nombre effacé. */
    purge(): Promise<number>
  }
  spaces: {
    create(input: CreateSpaceInput): Promise<void>
    update(input: UpdateSpaceInput): Promise<void>
    remove(id: string): Promise<void>
    /** Copie la configuration de l'espace, sans cookies ni historique. */
    duplicate(id: string): Promise<void>
    /** Vide cookies, stockage, cache et historique de cet espace seulement. */
    clearData(id: string): Promise<void>
    activate(id: string): Promise<void>
  }
  tabs: {
    create(input?: CreateTabInput): Promise<TabState>
    find(
      id: string,
      query: string,
      forward?: boolean
    ): Promise<{ matches: number; activeMatchOrdinal: number }>
    findStop(id: string, action?: 'clearSelection' | 'keepSelection'): Promise<void>
    close(id: string): Promise<void>
    activate(id: string): Promise<void>
    navigate(id: string, input: string): Promise<void>
    home(id: string): Promise<void>
    back(id: string): Promise<void>
    forward(id: string): Promise<void>
    /** Parcours de l'onglet, la plus ancienne page en premier. */
    entries(id: string): Promise<{ index: number; url: string; title: string }[]>
    /** Revient à une page précise du parcours de l'onglet. */
    goto(id: string, index: number): Promise<void>
    reload(id: string): Promise<void>
    /** Nouveau niveau de zoom (null si l'onglet n'a pas de page vivante). */
    zoom(id: string, direction: 'in' | 'out' | 'reset'): Promise<number | null>
    stop(id: string): Promise<void>
    pin(id: string, pinned: boolean): Promise<void>
    mute(id: string, muted: boolean): Promise<void>
    reopen(): Promise<void>
    splitToggle(): Promise<void>
    splitSet(id: string): Promise<void>
    splitRatio(ratio: number): Promise<void>
    focus(id: string): Promise<void>
    discard(id: string): Promise<void>
    reorder(input: ReorderTabsInput): Promise<void>
    print(id: string): Promise<boolean>
    /** Texte sélectionné dans la page, sans rien enregistrer. */
    selection(id: string): Promise<string>
  }
  groups: {
    create(input?: CreateGroupInput): Promise<TabGroup>
    update(input: UpdateGroupInput): Promise<void>
    remove(id: string): Promise<void>
  }
  views: {
    layout(request: LayoutRequest): void
    /**
     * Épreuves figées de deux volets, prises avant que leurs vues natives
     * quittent la scène. Sert de décor pendant le glissement du séparateur :
     * les vues doivent disparaître pour que le pointeur continue d'arriver à la
     * coque, mais un fond vide se lit comme un plantage.
     */
    snapshot(tabIds: string[]): Promise<PaneSnapshot[]>
    /**
     * Épreuves des pages poussées quand l'interface recouvre la scène : la vue
     * native est retirée, son image prend sa place. `null` rend la main aux
     * vues natives. Renvoie la fonction de désabonnement.
     */
    onFrozen(callback: (shots: PaneSnapshot[] | null) => void): () => void
    /**
     * Sens du défilement de la page active, pour replier la pilule du bas :
     * seule la page voit son propre `scroll`. Renvoie le désabonnement.
     */
    onScroll(callback: (direction: 'down' | 'up') => void): () => void
  }
  peek: {
    /**
     * Ouvre le coup d'œil dans la fenêtre principale. Sans adresse, la carte
     * s'ouvre sur son champ d'adresse ; l'espace actif prête sa session.
     * `false` si aucun espace ne peut l'accueillir.
     */
    open(input?: PeekOpenInput): Promise<boolean>
    close(): Promise<void>
    navigate(input: string): Promise<void>
    back(): Promise<void>
    forward(): Promise<void>
    reload(): Promise<void>
    stop(): Promise<void>
    /** Installe la page courante dans un vrai onglet, puis referme la carte. */
    openInTab(): Promise<boolean>
    /** Ouvre la page dans un onglet posé en second volet, puis referme. */
    openInSplit(): Promise<boolean>
    /** État courant, demandé au montage de la carte. */
    state(): Promise<PeekState | null>
    /** La carte annonce qu'elle est prête : on lui pousse l'état et le focus. */
    ready(): void
    /** Rectangle mesuré de la surface de page ; `null` retire la vue. */
    layout(rect: import('./types').Rect | null): void
    onState(callback: (state: PeekState | null) => void): () => void
    /** Demande de focus sur le champ d'adresse (ouverture, ⌘L). */
    onFocusAddress(callback: () => void): () => void
  }
  history: {
    list(): Promise<HistoryEntry[]>
    remove(url: string): Promise<void>
    clear(): Promise<void>
    /** Efface une période ; renvoie le nombre d'entrées retirées. */
    clearRange(range: import('./navigation').HistoryRange): Promise<number>
    /** Remet en place l'effacement encore annulable (8 secondes). */
    undo(): Promise<number>
  }
  favicons: {
    /** Data URL de l'icône du domaine, servie par le cache local de l'espace. */
    get(host: string, spaceId?: string): Promise<string | null>
    /** Même lecture, sans requête : seulement ce qui est déjà sur l'appareil. */
    peek(host: string, spaceId?: string): Promise<string | null>
    /**
     * Même lecture pour une liste : une seule réponse, les domaines inconnus
     * étant absents. Les lignes d'une liste demandent en une fois.
     */
    peekMany(hosts: string[], spaceId?: string): Promise<Record<string, string>>
    /** Vide mémoire et disque ; renvoie le nombre d'entrées supprimées. */
    purge(): Promise<number>
  }
  bookmarks: {
    /** Ajoute la page aux favoris, ou l'en retire : renvoie l'état final. */
    toggle(input: BookmarkToggleInput): Promise<boolean>
    remove(id: string): Promise<void>
    /** Favoris des navigateurs installés (lecture locale, rien n'est modifié). */
    detect(): Promise<BookmarkImportSource[]>
    /** Import en masse ; renvoie le nombre réellement ajouté, dans l'ordre du fichier. */
    addMany(entries: BookmarkEntry[]): Promise<number>
    /** Déplace un favori à une position absolue ; false si la demande est invalide. */
    move(id: string, position: number): Promise<boolean>
    /** Applique une permutation complète ; false si un doublon ou un inconnu apparaît. */
    reorder(ids: string[]): Promise<boolean>
    /** Écrit un fichier HTML de favoris ; renvoie le chemin, ou null si annulé. */
    exportHtml(): Promise<string | null>
    /** Lit un fichier HTML de favoris ; renvoie le nombre ajouté. */
    importHtml(): Promise<{ added: number; cancelled: boolean }>
  }
  tasks: {
    create(input: TaskCreateInput): Promise<import('./types').Task>
    toggle(id: string): Promise<void>
    remove(id: string): Promise<void>
  }
  works: {
    /** Rapport complet, chargé seulement à l'ouverture. */
    get(id: string): Promise<import('./types').WorkItem | null>
    rename(input: { id: string; title: string }): Promise<void>
    archive(input: { id: string; archived: boolean }): Promise<void>
  }
  notes: {
    get(id: string): Promise<Note | null>
    /**
     * Identifiants des notes qui correspondent à la recherche : mots tous
     * présents, `"expression exacte"`, et `-mot` / `-"expression"` exclus.
     */
    search(query: string): Promise<string[]>
    save(input: SaveNoteInput): Promise<Note>
    /** Change le titre, les étiquettes ou l'épinglage sans réécrire le corps. */
    patch(input: NotePatchInput): Promise<Note | null>
    remove(id: string): Promise<void>
    /** Notes passées par la corbeille, les plus récentes d'abord. */
    trash(): Promise<import('./types').TrashedNote[]>
    /** Remet une note de la corbeille dans la liste ; null si introuvable. */
    restore(id: string): Promise<Note | null>
    openFolder(): Promise<void>
    /** Capture la sélection de la page active avec sa source et la date. */
    captureSelection(): Promise<Note | null>
    /** Surligne la sélection et l'ajoute à la note de la page. */
    highlight(): Promise<Note | null>
    /** Surlignages enregistrés pour la page active. */
    highlights(): Promise<PageHighlight[]>
    /** Génère ou réécrit une note avec le modèle configuré. */
    ai(input: NoteAiInput): Promise<NoteAiResult>
    /** Renomme et réécrit les liens qui citaient l'ancien titre. */
    rename(input: NoteRenameInput): Promise<NoteRenameResult | null>
    /** Liens entrants, sortants et cassés de la note ouverte. */
    graph(id: string): Promise<NoteGraph>
    /** Enregistrements vocaux, en fichiers dans le dossier de l'espace. */
    audio: {
      save(input: NoteAudioSaveInput): Promise<{ name: string } | null>
      /** Data URL pour le lecteur, ou null si le fichier a disparu. */
      get(name: string): Promise<string | null>
      remove(name: string): Promise<boolean>
    }
    /** Transcription locale, ou distante avec un consentement explicite. */
    transcribe(input: NoteTranscribeInput): Promise<NoteTranscriptionResult>
  }
  privacy: {
    /** Désactive ou réactive le bloqueur pour un site ; true = exempté. */
    toggleSite(host: string): Promise<boolean>
  }
  tunnel: {
    run(input: TunnelRunInput): Promise<{ runId: string }>
    cancel(runId: string): void
    onEvent(callback: (event: TunnelEvent) => void): () => void
    maps(): Promise<TunnelMapSummary[]>
    load(id: string): Promise<TunnelMap | null>
    save(map: TunnelMap): Promise<{ ok: boolean }>
    rename(input: TunnelRenameInput): Promise<void>
    remove(id: string): Promise<void>
    duplicate(id: string): Promise<TunnelMap | null>
    savePng(input: TunnelSavePngInput): Promise<string | null>
    exportPdf(input: TunnelExportPdfInput): Promise<boolean>
  }
  selection: {
    onSelect(callback: (payload: SelectionPayload) => void): () => void
  }
  agent: {
    run(input: AgentRunRequest): Promise<{ runId: string }>
    cancel(runId?: string): void
    onEvent(callback: (event: AgentEvent) => void): () => void
  }
  comic: {
    /** Injecte la traduction de BD dans l'onglet, avec sa propre session. */
    run(tabId: string): Promise<ComicRunResult>
    clear(tabId: string): Promise<void>
  }
  settings: {
    update(patch: SettingsPatch): Promise<void>
    setKey(input: SetKeyInput): Promise<boolean>
    testKey(provider: ProviderId): Promise<KeyTestResult>
    /** Oublie le zoom d'un domaine ; false s'il n'était pas mémorisé. */
    forgetZoom(host: string): Promise<boolean>
  }
  appearance: {
    /** Ouvre un sélecteur d'image ; le chemin est enregistré dans les réglages. */
    pickImage(): Promise<{ path: string; dataUrl: string } | null>
    /** Relit l'image d'accueil enregistrée (null si aucune). */
    image(): Promise<string | null>
    clearImage(): Promise<void>
  }
  downloads: {
    list(): Promise<import('./types').DownloadItem[]>
    preview(id: string): Promise<boolean>
    open(id: string): Promise<void>
    clear(): Promise<void>
    /** Dossier de destination choisi ; null si la boîte est annulée. */
    pickDir(): Promise<string | null>
  }
  updates: {
    status(): Promise<UpdateInfo>
    check(): Promise<UpdateInfo>
    download(): Promise<UpdateInfo>
    cancel(): Promise<UpdateInfo>
    install(): Promise<void>
    releases(): Promise<void>
    onEvent(callback: (info: UpdateInfo) => void): () => void
  }
  processes(): Promise<{ live: number; processes: import('./types').ProcessInfo[] }>
  /** Double-clic sur une zone libre de la barre : agrandit ou restaure. */
  zoomWindow(): Promise<void>
  onState(callback: (view: AppView) => void): () => void
  onShortcut(callback: (event: ShortcutEvent) => void): () => void
}
