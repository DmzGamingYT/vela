import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { GALLERY_AVATARS } from '@shared/avatarGallery'
import { SPACE_COLORS, SPACE_TINTS, spaceTintFor } from '@shared/defaults'
import { THEME_PRESETS, fillAccent, presetById, type ThemeId } from '@shared/theme'
import {
  MAX_SHORTCUTS,
  MAX_SPACE_NAME,
  SPACE_AVATARS,
  SPACE_BACKGROUNDS,
  SPACE_PRESETS,
  SPACE_SHORTCUT_SETS,
  applySpaceTemplate,
  avatarFile,
  avatarImage,
  moveShortcutTo,
  normalizeLetterboxd,
  normalizeShortcutUrl,
  normalizeSpaceName,
  sanitizeSpaceShortcuts,
  shortcutsForSet,
  spaceNameProblem,
  suggestShortcutSet,
  suggestSpaceName,
  type SpaceBackground,
  type SpacePreset,
  type SpaceShortcut,
  type SpaceTemplateDraft
} from '@shared/space'
import { hostOf } from '@shared/url'
import { useModalFocus } from '../lib/useModalFocus'
import { useBrowser } from '../store/browser'
import Favicon from './Favicon'
import GalleryAvatar from './GalleryAvatar'
import { Icon } from './Icon'
import SpaceAvatar from './SpaceAvatar'
import SpaceAvatarEditor from './SpaceAvatarEditor'

/** Les quatre sources d’avatar, réunies derrière un seul sélecteur. */
type AvatarSource = 'monogram' | 'icons' | 'gallery' | 'photo'
type PreviewMode = 'light' | 'dark'
type ManageAction = 'delete' | 'clear' | null

const AVATAR_SOURCES: { id: AvatarSource; label: string }[] = [
  { id: 'monogram', label: 'Initiales' },
  { id: 'icons', label: 'Formes' },
  { id: 'gallery', label: 'Galerie' },
  { id: 'photo', label: 'Photo' }
]

const NAME_SUGGESTIONS = ['Travail', 'Veille', 'Études']

/** La valeur stockée dit d’elle-même d’où vient l’avatar. */
function sourceOf(value: string | null): AvatarSource {
  if (!value || value === 'monogram') return 'monogram'
  if (value.startsWith('icon:')) return 'icons'
  if (value.startsWith('gallery:')) return 'gallery'
  return 'photo'
}

interface DraftState extends SpaceTemplateDraft {
  blockTrackers: boolean
  theme: ThemeId | null
  watchlist: boolean
  letterboxd: string
}

function comparable(draft: DraftState): string {
  return JSON.stringify({
    name: normalizeSpaceName(draft.name),
    color: draft.color.toLowerCase(),
    avatar: draft.avatar,
    background: draft.background,
    theme: draft.theme,
    shortcuts: draft.shortcuts.map((shortcut) => `${shortcut.url}|${shortcut.title}`),
    blockTrackers: draft.blockTrackers,
    watchlist: draft.watchlist,
    letterboxd: draft.letterboxd.trim().toLowerCase()
  })
}

/** Flèches dans une grille de radios : le focus bouge, pas la sélection. */
function rovingKeyDown(event: ReactKeyboardEvent<HTMLElement>): void {
  const keys = ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Home', 'End']
  if (!keys.includes(event.key)) return
  const radios = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]:not([disabled])')
  )
  if (radios.length === 0) return
  const current = radios.indexOf(event.target as HTMLElement)
  if (current < 0) return
  event.preventDefault()
  const columns = Math.max(1, Number(event.currentTarget.dataset.columns || 0) || 1)
  let next = current
  if (event.key === 'ArrowRight') next = Math.min(radios.length - 1, current + 1)
  if (event.key === 'ArrowLeft') next = Math.max(0, current - 1)
  if (event.key === 'ArrowDown') next = Math.min(radios.length - 1, current + columns)
  if (event.key === 'ArrowUp') next = Math.max(0, current - columns)
  if (event.key === 'Home') next = 0
  if (event.key === 'End') next = radios.length - 1
  radios[next]?.focus()
}

function countLabel(count: number): string {
  return `${count} ${count === 1 ? 'site' : 'sites'}`
}

/** Pastille numérotée neutre : le chrome ne prend jamais la teinte de l’espace. */
function SectionTitle({ index, title, hint }: { index: number; title: string; hint?: string }) {
  return (
    <div className="space-section-head">
      <span className="space-section-index" aria-hidden="true">
        {index}
      </span>
      <h2 className="space-section-title">{title}</h2>
      {hint ? <span className="space-section-hint">{hint}</span> : null}
    </div>
  )
}

export default function SpaceDialog() {
  const view = useBrowser((state) => state.view)
  const editId = useBrowser((state) => state.spaceEditId)
  const setOverlay = useBrowser((state) => state.setOverlay)
  const createSpace = useBrowser((state) => state.createSpace)
  const updateSpace = useBrowser((state) => state.updateSpace)
  const removeSpace = useBrowser((state) => state.removeSpace)
  const duplicateSpace = useBrowser((state) => state.duplicateSpace)
  const clearSpaceData = useBrowser((state) => state.clearSpaceData)

  const existing = view?.spaces.find((space) => space.id === editId)
  const otherSpaces = (view?.spaces ?? []).filter((space) => space.id !== editId)
  const otherNames = otherSpaces.map((space) => space.name)

  const [name, setName] = useState(existing?.name ?? '')
  const [color, setColor] = useState(
    existing?.color ?? SPACE_COLORS[(view?.spaces.length ?? 0) % SPACE_COLORS.length]
  )
  const [avatar, setAvatar] = useState<string | null>(existing?.avatar ?? null)
  const [avatarSource, setAvatarSource] = useState<AvatarSource>(sourceOf(existing?.avatar ?? null))
  const [background, setBackground] = useState<SpaceBackground>(existing?.background ?? 'none')
  const [blockTrackers, setBlockTrackers] = useState(existing?.blockTrackers !== false)
  const [theme, setTheme] = useState<ThemeId | null>(existing?.theme ?? null)
  const [shortcuts, setShortcuts] = useState<SpaceShortcut[]>(() => [
    ...(existing?.shortcuts ?? [])
  ])
  const [watchlist, setWatchlist] = useState(existing?.watchlist === true)
  const [letterboxd, setLetterboxd] = useState(existing?.letterboxd ?? '')

  const [previewMode, setPreviewMode] = useState<PreviewMode>(() =>
    typeof document !== 'undefined' && document.documentElement.dataset.mode === 'light'
      ? 'light'
      : 'dark'
  )
  const [nameTouched, setNameTouched] = useState(false)
  const [attempted, setAttempted] = useState(false)
  const [siteInput, setSiteInput] = useState('')
  const [siteError, setSiteError] = useState<string | null>(null)
  const [photo, setPhoto] = useState<string | null>(null)
  const [filePreview, setFilePreview] = useState<string | null>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [customOpen, setCustomOpen] = useState(Boolean(existing && !spaceTintFor(existing.color)))
  const [customInput, setCustomInput] = useState(existing?.color ?? color)
  const [tintNotice, setTintNotice] = useState<string | null>(null)
  const [tintError, setTintError] = useState<string | null>(null)
  const [starter, setStarter] = useState<string | null>(existing ? null : 'blank')
  const [appliedTemplate, setAppliedTemplate] = useState<string | null>(null)
  const [pinsOpen, setPinsOpen] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [dirtyClose, setDirtyClose] = useState(false)
  const [manageAction, setManageAction] = useState<ManageAction>(null)
  const [saving, setSaving] = useState(false)
  const [liveMessage, setLiveMessage] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  const dragIdRef = useRef<string | null>(null)
  const pinRefs = useRef(new Map<string, HTMLLIElement>())
  const inputRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const sheetRef = useModalFocus<HTMLDivElement>()
  const templateSnapshot = useRef<{ draft: SpaceTemplateDraft; starter: string | null } | null>(
    null
  )
  const templateTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const initialRef = useRef<DraftState>({
    name: existing?.name ?? '',
    color: existing?.color ?? SPACE_COLORS[(view?.spaces.length ?? 0) % SPACE_COLORS.length],
    avatar: existing?.avatar ?? null,
    background: existing?.background ?? 'none',
    shortcuts: [...(existing?.shortcuts ?? [])],
    blockTrackers: existing?.blockTrackers !== false,
    theme: existing?.theme ?? null,
    watchlist: existing?.watchlist === true,
    letterboxd: existing?.letterboxd ?? ''
  })

  const draft: DraftState = {
    name,
    color,
    avatar,
    background,
    shortcuts,
    blockTrackers,
    theme,
    watchlist,
    letterboxd
  }

  const previewName = normalizeSpaceName(name) || suggestSpaceName(otherNames)
  const monogram = previewName.slice(0, 1).toUpperCase() || '·'
  const nameIssue = spaceNameProblem(name, otherNames)
  const nameProblem = nameTouched || attempted ? nameIssue : null
  const suggestedName = suggestSpaceName(otherNames)
  const normalizedLetterboxd = normalizeLetterboxd(letterboxd)
  const letterboxdError =
    letterboxd.trim() && !normalizedLetterboxd
      ? 'Nom de compte invalide — par exemple « votre-nom ».'
      : null
  const tint = tintForColor(color)
  const tintLabel = tint?.label ?? 'Personnalisée'
  const ambienceLabel = SPACE_BACKGROUNDS.find((item) => item.id === background)?.label ?? 'Aucune'
  const iconSpaceId = existing?.id ?? view?.activeSpaceId ?? undefined
  const storedImage = avatarImage(avatar) ?? filePreview
  const storedFile = avatarFile(avatar)
  const dirty = comparable(draft) !== comparable(initialRef.current)
  const suggestedSet = shortcuts.length === 0 ? suggestShortcutSet(name) : null
  const suggestedLabel = suggestedSet
    ? (SPACE_PRESETS.find((preset) => preset.id === suggestedSet)?.label ?? 'ce type d’espace')
    : null

  function tintForColor(value: string) {
    return spaceTintFor(value)
  }

  // Le nom reçoit le focus à l’ouverture, comme dans la fenêtre d’origine.
  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  useEffect(() => {
    return () => {
      if (templateTimer.current) clearTimeout(templateTimer.current)
    }
  }, [])

  // La photo peut être un fichier du dossier de données : on la relit pour
  // l’aperçu et le recadrage, sans la remettre dans vela.json.
  useEffect(() => {
    if (!storedFile) {
      setFilePreview(null)
      return
    }
    let alive = true
    void window.vela.avatars
      .read(storedFile)
      .then((data) => {
        if (alive && data) setFilePreview(data)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [storedFile])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (manageAction) {
          setManageAction(null)
          return
        }
        requestClose()
        return
      }
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        formRef.current?.requestSubmit()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  })

  if (!view) return null

  const clearTemplateTimer = (): void => {
    if (templateTimer.current) clearTimeout(templateTimer.current)
    templateTimer.current = null
  }

  const announce = (message: string): void => {
    setLiveMessage('')
    window.setTimeout(() => setLiveMessage(message), 20)
  }

  const templateDraft = (): SpaceTemplateDraft => ({
    name,
    color,
    avatar,
    background,
    shortcuts: [...shortcuts]
  })

  const restoreSnapshot = (): void => {
    const snapshot = templateSnapshot.current
    if (!snapshot) return
    setName(snapshot.draft.name)
    setColor(snapshot.draft.color)
    setAvatar(snapshot.draft.avatar)
    setAvatarSource(sourceOf(snapshot.draft.avatar))
    setBackground(snapshot.draft.background)
    setShortcuts([...snapshot.draft.shortcuts])
    setStarter(snapshot.starter)
    setAppliedTemplate(null)
    setPhoto(null)
    setSiteError(null)
    clearTemplateTimer()
    announce('Modèle annulé. Le brouillon précédent est restauré.')
  }

  const markApplied = (label: string): void => {
    setAppliedTemplate(label)
    clearTemplateTimer()
    templateTimer.current = setTimeout(() => setAppliedTemplate(null), 8000)
  }

  const applyPreset = (preset: SpacePreset): void => {
    templateSnapshot.current = { draft: templateDraft(), starter }
    const next = applySpaceTemplate(templateDraft(), preset)
    setName(next.name)
    setColor(next.color)
    setCustomOpen(false)
    setCustomInput(next.color)
    setTintError(null)
    setTintNotice(null)
    setAvatar(next.avatar)
    setAvatarSource(sourceOf(next.avatar))
    setBackground(next.background)
    setShortcuts(next.shortcuts)
    setStarter(preset.id)
    setPhoto(null)
    setSiteError(null)
    setNameTouched(false)
    markApplied(preset.label)
    announce(
      `Modèle ${preset.label} appliqué : ${countLabel(next.shortcuts.length)}, ${SPACE_BACKGROUNDS.find((item) => item.id === preset.background)?.label ?? 'aucune ambiance'}.`
    )
  }

  const applyBlank = (): void => {
    templateSnapshot.current = { draft: templateDraft(), starter }
    setColor(SPACE_COLORS[(view?.spaces.length ?? 0) % SPACE_COLORS.length])
    setCustomInput(SPACE_COLORS[(view?.spaces.length ?? 0) % SPACE_COLORS.length])
    setCustomOpen(false)
    setTintError(null)
    setTintNotice(null)
    setAvatar(null)
    setAvatarSource('monogram')
    setBackground('none')
    setShortcuts([])
    setStarter('blank')
    setPhoto(null)
    setSiteError(null)
    markApplied('Espace vierge')
    announce('Espace vierge : aucun site, aucune ambiance.')
  }

  const commitCustomTint = (raw: string): void => {
    const value = raw.trim().replace(/^#/, '')
    if (!/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) {
      setTintError('Couleur hexadécimale attendue, par exemple #7d5bd6.')
      setTintNotice(null)
      return
    }
    const expanded =
      value.length === 3
        ? `#${value
            .split('')
            .map((part) => part + part)
            .join('')}`
        : `#${value}`
    const safe = fillAccent(expanded.toLowerCase())
    setColor(safe)
    setCustomInput(safe)
    setTintError(null)
    setStarter(null)
    setTintNotice(
      safe !== expanded.toLowerCase()
        ? `Contraste corrigé en ${safe.toUpperCase()} pour garder un texte lisible.`
        : null
    )
    announce(`Teinte personnalisée ${safe.toUpperCase()}.`)
  }

  const addSite = (raw: string): void => {
    const url = normalizeShortcutUrl(raw)
    if (!url) {
      setSiteError('Adresse invalide — seuls les sites http et https sont acceptés.')
      announce('Adresse refusée.')
      return
    }
    if (shortcuts.length >= MAX_SHORTCUTS) {
      setSiteError(`${MAX_SHORTCUTS} sites au maximum.`)
      return
    }
    if (shortcuts.some((shortcut) => shortcut.url === url)) {
      setSiteError('Ce site est déjà épinglé.')
      announce('Ce site est déjà épinglé.')
      return
    }
    const [entry] = sanitizeSpaceShortcuts([{ url }])
    if (!entry) {
      setSiteError('Adresse refusée. Seuls les sites http et https sont acceptés.')
      return
    }
    setShortcuts((current) => [...current, entry])
    setStarter(null)
    setSiteInput('')
    setSiteError(null)
    announce(`${entry.title} épinglé.`)
  }

  const dropAddress = (event: React.DragEvent<HTMLElement>): void => {
    if (dragIdRef.current) return
    const raw =
      event.dataTransfer.getData('text/uri-list') ||
      event.dataTransfer.getData('text/plain') ||
      event.dataTransfer.getData('text/x-moz-url')
    const first = raw.split(/\r?\n/).find((line) => line && !line.startsWith('#'))
    if (!first) return
    event.preventDefault()
    addSite(first)
  }

  const focusPin = (id: string): void => {
    window.requestAnimationFrame(() => pinRefs.current.get(id)?.focus())
  }

  const movePin = (id: string, delta: number): void => {
    setShortcuts((current) => {
      const from = current.findIndex((item) => item.id === id)
      if (from < 0) return current
      return moveShortcutTo(current, id, from + delta)
    })
    setStarter(null)
    focusPin(id)
  }

  const dropPin = (targetId: string): void => {
    const moving = dragIdRef.current
    if (!moving || moving === targetId) return
    setShortcuts((current) => {
      const to = current.findIndex((item) => item.id === targetId)
      if (to < 0) return current
      return moveShortcutTo(current, moving, to)
    })
    setStarter(null)
    dragIdRef.current = null
    setDragId(null)
    setDropTarget(null)
  }

  const importPhoto = (file: File | undefined): void => {
    setPhotoError(null)
    if (!file) return
    if (!/^image\/(png|jpeg|webp)$/i.test(file.type)) {
      setPhotoError('Choisissez une image PNG, JPEG ou WebP.')
      return
    }
    if (file.size > 8 * 1024 * 1024) {
      setPhotoError('Image trop lourde (8 Mo maximum).')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setPhoto(String(reader.result))
      setStarter(null)
    }
    reader.onerror = () => setPhotoError('Lecture de l’image impossible.')
    reader.readAsDataURL(file)
  }

  const requestClose = (): void => {
    if (dirty && !dirtyClose) {
      setDirtyClose(true)
      return
    }
    setOverlay(null)
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    setAttempted(true)
    setNameTouched(true)
    if (nameIssue || letterboxdError || saving) {
      if (nameIssue) inputRef.current?.focus()
      return
    }
    setSaving(true)
    const payload = {
      name: normalizeSpaceName(name),
      color,
      avatar,
      background,
      blockTrackers,
      theme,
      shortcuts,
      watchlist,
      letterboxd: normalizedLetterboxd
    }
    try {
      if (existing) await updateSpace(existing.id, payload)
      else await createSpace(payload)
    } finally {
      setSaving(false)
    }
  }

  const setTint = (next: string): void => {
    setColor(next)
    setCustomInput(next)
    setCustomOpen(false)
    setTintError(null)
    setTintNotice(null)
    setStarter(null)
  }

  const nameHintId = nameProblem ? 'space-name-problem' : 'space-name-help'
  const summary = `${tintLabel} · ${ambienceLabel} · ${countLabel(shortcuts.length)}`

  return (
    <div className="overlay space-overlay" onMouseDown={requestClose}>
      <div
        ref={sheetRef}
        className="sheet space-sheet space-sheet-v2"
        role="dialog"
        aria-modal="true"
        aria-label={existing ? `Modifier ${existing.name}` : 'Nouvel espace'}
        style={{ '--space-color': color } as CSSProperties}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="space-dialog-head">
          <div>
            <p className="eyebrow">
              <span className="eyebrow-dot" />
              {existing ? 'Modifier l’espace' : 'Nouvel espace'}
            </p>
            <h1>{existing ? existing.name : 'Un espace à part'}</h1>
            <p className="sheet-lede">
              Un espace garde ses propres cookies et sessions : deux comptes sur le même site, sans
              conflit.
            </p>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={requestClose}
            title="Fermer"
            aria-label="Fermer"
          >
            <Icon name="close" size={18} />
          </button>
        </header>

        <form ref={formRef} className="space-body" onSubmit={submit}>
          <div className="space-fields-v2">
            <section className="space-section">
              <SectionTitle index={1} title="Nom" />
              <label className="field space-name-field">
                <span className="sr-only">Nom de l’espace</span>
                <input
                  ref={inputRef}
                  className="space-name-input"
                  value={name}
                  maxLength={MAX_SPACE_NAME}
                  placeholder={suggestedName}
                  aria-invalid={nameProblem ? 'true' : undefined}
                  aria-describedby={nameHintId}
                  onChange={(event) => setName(event.target.value.slice(0, MAX_SPACE_NAME))}
                  onBlur={() => setNameTouched(true)}
                />
                <span className="space-counter" aria-hidden="true">
                  {name.length}/{MAX_SPACE_NAME}
                </span>
              </label>
              {nameProblem ? (
                <p className="space-error" id="space-name-problem" role="alert">
                  {nameProblem === 'empty'
                    ? 'Donnez un nom à cet espace.'
                    : nameProblem === 'duplicate'
                      ? 'Ce nom est déjà utilisé par un autre espace.'
                      : `${MAX_SPACE_NAME} caractères au maximum.`}
                  {nameProblem === 'empty' ? (
                    <button
                      type="button"
                      className="space-inline-link"
                      onClick={() => {
                        setName(suggestedName)
                        setNameTouched(true)
                        inputRef.current?.focus()
                      }}
                    >
                      Utiliser « {suggestedName} »
                    </button>
                  ) : null}
                </p>
              ) : (
                <p className="space-help" id="space-name-help">
                  {name.length >= MAX_SPACE_NAME
                    ? `Limite de ${MAX_SPACE_NAME} caractères atteinte.`
                    : 'Court et reconnaissable : il apparaît dans le rail et l’aperçu.'}
                </p>
              )}
              <div className="space-suggestions" aria-label="Noms suggérés">
                {NAME_SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    className="space-suggestion"
                    onClick={() => {
                      setName(suggestion)
                      setNameTouched(true)
                      inputRef.current?.focus()
                    }}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </section>

            <section className="space-section">
              <SectionTitle index={2} title="Point de départ" />
              <div
                className="space-templates"
                role="radiogroup"
                aria-label="Point de départ de l’espace"
                data-columns="2"
                onKeyDown={rovingKeyDown}
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={starter === 'blank'}
                  tabIndex={starter === 'blank' ? 0 : -1}
                  className="space-template space-template-wide"
                  data-active={starter === 'blank' ? 'true' : undefined}
                  onClick={applyBlank}
                >
                  <span className="space-template-mark space-template-blank" aria-hidden="true">
                    <Icon name="plus" size={14} />
                  </span>
                  <span className="space-template-copy">
                    <strong>Espace vierge</strong>
                    <small>
                      <span>Aucun site</span>
                      <span className="space-template-sep">·</span>
                      <span>Aucune ambiance</span>
                    </small>
                  </span>
                  <span className="space-check" aria-hidden="true">
                    <Icon name="check" size={11} />
                  </span>
                </button>

                {SPACE_PRESETS.map((preset) => {
                  const sites = shortcutsForSet(preset.id)
                  const ambience =
                    SPACE_BACKGROUNDS.find((item) => item.id === preset.background)?.label ??
                    'Aucune'
                  const active = starter === preset.id
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      tabIndex={active ? 0 : -1}
                      className="space-template"
                      data-active={active ? 'true' : undefined}
                      data-preset={preset.id}
                      onClick={() => applyPreset(preset)}
                    >
                      <span className="space-template-mark" aria-hidden="true">
                        <SpaceAvatar
                          space={{ name: preset.label, color: preset.color, avatar: preset.avatar }}
                          size={26}
                        />
                      </span>
                      <span className="space-template-copy">
                        <strong>{preset.label}</strong>
                        <small>
                          <span>{countLabel(sites.length)}</span>
                          <span className="space-template-sep">·</span>
                          <span>{ambience}</span>
                        </small>
                        <span className="space-template-icons" aria-hidden="true">
                          {sites.slice(0, 5).map((site) => (
                            <Favicon
                              key={site.id}
                              url={site.url}
                              label={site.title}
                              size={11}
                              spaceId={iconSpaceId}
                              cacheOnly
                            />
                          ))}
                        </span>
                      </span>
                      <span className="space-check" aria-hidden="true">
                        <Icon name="check" size={11} />
                      </span>
                    </button>
                  )
                })}
              </div>
              <div className="space-template-status" aria-live="polite">
                {appliedTemplate ? (
                  <span className="space-applied">
                    Modèle appliqué · {appliedTemplate}
                    <button type="button" className="space-inline-link" onClick={restoreSnapshot}>
                      Annuler
                    </button>
                  </span>
                ) : (
                  <span className="space-help">
                    Le modèle remplit l’apparence et les sites. Un nom déjà saisi n’est pas écrasé.
                  </span>
                )}
              </div>
            </section>

            <section className="space-section">
              <SectionTitle index={3} title="Apparence" />
              <div className="space-avatar-tabs" role="tablist" aria-label="Source de l’avatar">
                {AVATAR_SOURCES.map((source) => (
                  <button
                    key={source.id}
                    type="button"
                    role="tab"
                    id={`space-avatar-tab-${source.id}`}
                    aria-selected={avatarSource === source.id}
                    aria-controls={`space-avatar-panel-${source.id}`}
                    tabIndex={avatarSource === source.id ? 0 : -1}
                    className="space-avatar-tab"
                    data-active={avatarSource === source.id ? 'true' : undefined}
                    onClick={() => setAvatarSource(source.id)}
                    onKeyDown={(event) => {
                      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
                      event.preventDefault()
                      const index = AVATAR_SOURCES.findIndex((item) => item.id === avatarSource)
                      const step = event.key === 'ArrowRight' ? 1 : -1
                      const next = (index + step + AVATAR_SOURCES.length) % AVATAR_SOURCES.length
                      setAvatarSource(AVATAR_SOURCES[next].id)
                      document
                        .getElementById(`space-avatar-tab-${AVATAR_SOURCES[next].id}`)
                        ?.focus()
                    }}
                  >
                    {source.label}
                  </button>
                ))}
              </div>

              <div
                className="space-avatar-panel"
                id={`space-avatar-panel-${avatarSource}`}
                role="tabpanel"
                aria-labelledby={`space-avatar-tab-${avatarSource}`}
              >
                {avatarSource === 'monogram' ? (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={!avatar || avatar === 'monogram'}
                    tabIndex={0}
                    className="space-avatar-option space-avatar-monogram"
                    data-active={!avatar || avatar === 'monogram' ? 'true' : undefined}
                    onClick={() => {
                      setAvatar('monogram')
                      setStarter(null)
                    }}
                  >
                    <span className="space-monogram" style={{ background: color }}>
                      {monogram}
                    </span>
                    <span className="space-avatar-copy">
                      <strong>Initiales</strong>
                      <small>La première lettre du nom, sur la teinte choisie</small>
                    </span>
                    <span className="space-check" aria-hidden="true">
                      <Icon name="check" size={11} />
                    </span>
                  </button>
                ) : null}

                {avatarSource === 'icons' ? (
                  <div
                    className="space-avatar-grid"
                    role="radiogroup"
                    aria-label="Formes d’avatar"
                    data-columns="8"
                    onKeyDown={rovingKeyDown}
                  >
                    {SPACE_AVATARS.map((mark, index) => {
                      const active = avatar === `icon:${mark.id}`
                      return (
                        <button
                          key={mark.id}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          aria-label={mark.label}
                          title={mark.label}
                          tabIndex={active || (!avatar && index === 0) ? 0 : -1}
                          className="space-avatar-choice"
                          data-active={active ? 'true' : undefined}
                          onClick={() => {
                            setAvatar(`icon:${mark.id}`)
                            setStarter(null)
                          }}
                        >
                          <svg viewBox="0 0 24 24" width={17} height={17} aria-hidden="true">
                            <path
                              d={mark.path}
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={1.7}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                          <span className="space-check" aria-hidden="true">
                            <Icon name="check" size={9} />
                          </span>
                        </button>
                      )
                    })}
                  </div>
                ) : null}

                {avatarSource === 'gallery' ? (
                  <div
                    className="space-avatar-grid space-avatar-gallery"
                    role="radiogroup"
                    aria-label="Avatars de la galerie"
                    data-columns="8"
                    onKeyDown={rovingKeyDown}
                  >
                    {GALLERY_AVATARS.map((entry) => {
                      const active = avatar === `gallery:${entry.id}`
                      return (
                        <button
                          key={entry.id}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          aria-label={entry.label}
                          title={entry.label}
                          tabIndex={active ? 0 : -1}
                          className="space-avatar-choice"
                          data-active={active ? 'true' : undefined}
                          onClick={() => {
                            setAvatar(`gallery:${entry.id}`)
                            setStarter(null)
                          }}
                        >
                          <GalleryAvatar id={entry.id} initial={monogram} size={28} />
                          <span className="space-check" aria-hidden="true">
                            <Icon name="check" size={9} />
                          </span>
                        </button>
                      )
                    })}
                  </div>
                ) : null}

                {avatarSource === 'photo' ? (
                  <div className="space-photo">
                    <div
                      className="space-photo-drop"
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault()
                        importPhoto(event.dataTransfer.files?.[0])
                      }}
                    >
                      <span
                        className="space-photo-preview"
                        data-empty={storedImage ? undefined : 'true'}
                      >
                        {storedImage ? (
                          <img src={storedImage} alt="Photo de profil de l’espace" />
                        ) : (
                          <Icon name="image" size={20} />
                        )}
                      </span>
                      <span className="space-avatar-copy">
                        <strong>{storedImage ? 'Photo importée' : 'Déposez une photo'}</strong>
                        <small>PNG, JPEG ou WebP, 8 Mo au plus — recadrée en carré</small>
                      </span>
                      <button
                        type="button"
                        className="space-small-btn"
                        onClick={() => fileRef.current?.click()}
                      >
                        <Icon name="image" size={12} />
                        {storedImage ? 'Remplacer' : 'Importer'}
                      </button>
                    </div>
                    {storedImage && !photo ? (
                      <div className="space-photo-actions">
                        <button
                          type="button"
                          className="space-inline-link"
                          onClick={() => setPhoto(storedImage)}
                        >
                          <Icon name="edit" size={11} />
                          Recadrer
                        </button>
                        <button
                          type="button"
                          className="space-inline-link"
                          onClick={() => {
                            setAvatar('monogram')
                            setAvatarSource('monogram')
                            setStarter(null)
                          }}
                        >
                          <Icon name="trash" size={11} />
                          Retirer la photo
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {photoError ? (
                  <p className="space-error" role="alert">
                    {photoError}
                  </p>
                ) : null}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  aria-label="Choisir une photo de profil"
                  onChange={(event) => {
                    importPhoto(event.target.files?.[0])
                    event.target.value = ''
                  }}
                />
              </div>

              <div className="space-row">
                <span className="space-row-label" id="space-tint-label">
                  Teinte
                </span>
                <div
                  className="space-tints"
                  role="radiogroup"
                  aria-labelledby="space-tint-label"
                  data-columns="11"
                  onKeyDown={rovingKeyDown}
                >
                  {SPACE_TINTS.map((entry, index) => {
                    const active = entry.color.toLowerCase() === color.toLowerCase()
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        aria-label={entry.label}
                        title={entry.label}
                        tabIndex={active ? 0 : !tint && index === 0 ? 0 : -1}
                        className="space-tint"
                        data-active={active ? 'true' : undefined}
                        onClick={() => setTint(entry.color)}
                      >
                        <span
                          className="space-tint-dot"
                          style={{ background: entry.color }}
                          aria-hidden="true"
                        >
                          {active ? <Icon name="check" size={11} /> : null}
                        </span>
                        <span className="space-tint-name">{entry.label}</span>
                      </button>
                    )
                  })}
                  <button
                    type="button"
                    role="radio"
                    aria-checked={!tint}
                    aria-label="Teinte personnalisée"
                    title="Personnalisée"
                    tabIndex={!tint ? 0 : -1}
                    className="space-tint space-tint-custom"
                    data-active={!tint ? 'true' : undefined}
                    onClick={() => {
                      setCustomOpen((value) => !value)
                      setStarter(null)
                    }}
                  >
                    <span className="space-tint-dot space-tint-rainbow" aria-hidden="true">
                      {!tint ? <Icon name="check" size={11} /> : null}
                    </span>
                    <span className="space-tint-name">Personnalisée</span>
                  </button>
                </div>
                {customOpen || !tint ? (
                  <div className="space-custom-tint">
                    <input
                      type="color"
                      className="space-color-input"
                      value={/^#[0-9a-f]{6}$/i.test(color) ? color : '#5b5bd6'}
                      aria-label="Choisir une couleur personnalisée"
                      onChange={(event) => commitCustomTint(event.target.value)}
                    />
                    <input
                      className="space-hex-input"
                      value={customInput}
                      spellCheck={false}
                      aria-label="Couleur hexadécimale"
                      onChange={(event) => {
                        setCustomInput(event.target.value)
                        setTintError(null)
                      }}
                      onBlur={() => commitCustomTint(customInput)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          commitCustomTint(customInput)
                        }
                      }}
                    />
                    <span className="space-help">Sélecteur ou code hexadécimal.</span>
                  </div>
                ) : null}
                {tintError ? (
                  <p className="space-error" role="alert">
                    {tintError}
                  </p>
                ) : null}
                {tintNotice ? <p className="space-help">{tintNotice}</p> : null}
              </div>

              <div className="space-row">
                <span className="space-row-label" id="space-ambience-label">
                  Ambiance
                </span>
                <div
                  className="space-ambiences"
                  role="radiogroup"
                  aria-labelledby="space-ambience-label"
                  data-columns="5"
                  onKeyDown={rovingKeyDown}
                >
                  {SPACE_BACKGROUNDS.map((entry) => {
                    const active = background === entry.id
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        tabIndex={active ? 0 : -1}
                        className="space-ambience"
                        data-active={active ? 'true' : undefined}
                        data-bg={entry.id}
                        style={{ '--space-color': color } as CSSProperties}
                        onClick={() => {
                          setBackground(entry.id)
                          setStarter(null)
                        }}
                      >
                        <span className="space-ambience-swatch" aria-hidden="true" />
                        <span className="space-ambience-copy">
                          <strong>{entry.label}</strong>
                          <small>{entry.detail}</small>
                        </span>
                        <span className="space-check" aria-hidden="true">
                          <Icon name="check" size={10} />
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </section>

            <details
              className="space-fold"
              open={pinsOpen}
              onToggle={(event) => setPinsOpen(event.currentTarget.open)}
            >
              <summary className="space-fold-summary">
                <span className="space-section-index" aria-hidden="true">
                  4
                </span>
                <span className="space-fold-title">Sites épinglés</span>
                <span className="space-fold-hint">Optionnel</span>
                <span className="space-fold-count">
                  {shortcuts.length}/{MAX_SHORTCUTS}
                </span>
                <Icon name="chevron-down" size={13} />
              </summary>
              <div
                className="space-fold-body"
                onDragOver={(event) => {
                  if (!dragIdRef.current) event.preventDefault()
                }}
                onDrop={dropAddress}
              >
                {suggestedSet && suggestedLabel ? (
                  <button
                    type="button"
                    className="space-suggest-set"
                    onClick={() => {
                      setShortcuts(shortcutsForSet(suggestedSet))
                      setStarter(null)
                      setSiteError(null)
                      announce(`Sites conseillés pour ${suggestedLabel} ajoutés.`)
                    }}
                  >
                    <Icon name="sparkles" size={12} />
                    Ajouter les {countLabel(SPACE_SHORTCUT_SETS[suggestedSet]?.length ?? 0)}{' '}
                    conseillés pour {suggestedLabel}
                  </button>
                ) : null}

                {shortcuts.length > 0 ? (
                  <ul
                    className="space-pins"
                    aria-label="Sites épinglés, réordonnables avec Alt et les flèches"
                  >
                    {shortcuts.map((shortcut, index) => (
                      <li
                        key={shortcut.id}
                        ref={(node) => {
                          if (node) pinRefs.current.set(shortcut.id, node)
                          else pinRefs.current.delete(shortcut.id)
                        }}
                        tabIndex={0}
                        draggable
                        data-pin-id={shortcut.id}
                        data-drag={dragId === shortcut.id ? 'true' : undefined}
                        data-over={dropTarget === shortcut.id ? 'true' : undefined}
                        aria-label={`${shortcut.title}, position ${index + 1} sur ${shortcuts.length}. Alt plus flèche pour déplacer.`}
                        onKeyDown={(event) => {
                          if (
                            event.altKey &&
                            (event.key === 'ArrowUp' || event.key === 'ArrowDown')
                          ) {
                            event.preventDefault()
                            movePin(shortcut.id, event.key === 'ArrowUp' ? -1 : 1)
                          }
                        }}
                        onDragStart={(event) => {
                          dragIdRef.current = shortcut.id
                          setDragId(shortcut.id)
                          event.dataTransfer.effectAllowed = 'move'
                          event.dataTransfer.setData('text/uri-list', shortcut.url)
                        }}
                        onDragEnd={() => {
                          dragIdRef.current = null
                          setDragId(null)
                          setDropTarget(null)
                        }}
                        onDragOver={(event) => {
                          event.preventDefault()
                          if (dragIdRef.current && dragIdRef.current !== shortcut.id) {
                            setDropTarget(shortcut.id)
                          }
                        }}
                        onDragLeave={() =>
                          setDropTarget((current) => (current === shortcut.id ? null : current))
                        }
                        onDrop={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          dropPin(shortcut.id)
                        }}
                      >
                        <span className="space-pin-grip" aria-hidden="true" />
                        <Favicon
                          url={shortcut.url}
                          label={shortcut.title}
                          size={16}
                          spaceId={existing?.id}
                          cacheOnly
                        />
                        <span className="space-pin-copy">
                          <strong>{shortcut.title}</strong>
                          <small>{hostOf(shortcut.url)}</small>
                        </span>
                        <span className="space-pin-move">
                          <button
                            type="button"
                            onClick={() => movePin(shortcut.id, -1)}
                            disabled={index === 0}
                            aria-label={`Monter ${shortcut.title}`}
                            title="Monter"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => movePin(shortcut.id, 1)}
                            disabled={index === shortcuts.length - 1}
                            aria-label={`Descendre ${shortcut.title}`}
                            title="Descendre"
                          >
                            ↓
                          </button>
                        </span>
                        <button
                          type="button"
                          className="space-pin-remove"
                          aria-label={`Retirer ${shortcut.title}`}
                          title={`Retirer ${shortcut.title}`}
                          onClick={() => {
                            setShortcuts((current) =>
                              current.filter((item) => item.id !== shortcut.id)
                            )
                            setStarter(null)
                          }}
                        >
                          <Icon name="close" size={11} />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="space-help">
                    Aucun site épinglé. Ajoutez une adresse, ou déposez-la depuis la page.
                  </p>
                )}

                <div className="space-pin-add">
                  <input
                    className="space-pin-input"
                    value={siteInput}
                    placeholder="notion.so, github.com…"
                    aria-label="Adresse d’un site à épingler"
                    spellCheck={false}
                    onChange={(event) => {
                      setSiteInput(event.target.value)
                      setSiteError(null)
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter') return
                      event.preventDefault()
                      addSite(siteInput)
                    }}
                  />
                  <button
                    type="button"
                    className="space-small-btn"
                    onClick={() => addSite(siteInput)}
                  >
                    <Icon name="plus" size={12} />
                    Épingler
                  </button>
                </div>
                {siteError ? (
                  <p className="space-error" role="alert">
                    {siteError}
                  </p>
                ) : null}
                <p className="space-help">
                  Glissez une ligne pour changer l’ordre, ou une adresse depuis la page. Au clavier
                  : Alt + flèches.
                </p>
              </div>
            </details>

            <details
              className="space-fold"
              open={advancedOpen}
              onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
            >
              <summary className="space-fold-summary">
                <span className="space-section-index" aria-hidden="true">
                  5
                </span>
                <span className="space-fold-title">Avancé</span>
                <span className="space-fold-hint">Réglages propres à cet espace</span>
                <Icon name="chevron-down" size={13} />
              </summary>
              <div className="space-fold-body">
                <div className="space-toggle-row">
                  <div>
                    <span>Filtrer les traqueurs</span>
                    <small>Publicités et mesure, pour cet espace seulement.</small>
                  </div>
                  <button
                    type="button"
                    className="switch"
                    role="switch"
                    aria-checked={blockTrackers}
                    data-on={blockTrackers ? 'true' : 'false'}
                    onClick={() => setBlockTrackers((value) => !value)}
                    aria-label="Filtrer les traqueurs dans cet espace"
                  >
                    <span />
                  </button>
                </div>

                {view.settings.perSpaceThemes ? (
                  <label className="field">
                    <span>Thème de couleur de l’espace</span>
                    <select
                      className="select"
                      value={theme ?? ''}
                      onChange={(event) => setTheme((event.target.value || null) as ThemeId | null)}
                    >
                      <option value="">
                        Thème global ({presetById(view.settings.themeId)?.label ?? 'personnalisé'})
                      </option>
                      {THEME_PRESETS.map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {preset.label}
                        </option>
                      ))}
                      <option value="custom">Couleur personnalisée</option>
                    </select>
                  </label>
                ) : null}

                <div className="space-toggle-row">
                  <div>
                    <span>Liste à voir</span>
                    <small>
                      Une carte sur l’accueil de cet espace : titres à voir et tirage « Ce soir ».
                    </small>
                  </div>
                  <button
                    type="button"
                    className="switch"
                    role="switch"
                    aria-checked={watchlist}
                    data-on={watchlist ? 'true' : 'false'}
                    onClick={() => setWatchlist((value) => !value)}
                    aria-label="Afficher la liste à voir sur l’accueil"
                  >
                    <span />
                  </button>
                </div>

                <label className="field">
                  <span>Compte Letterboxd</span>
                  <input
                    className="space-name-input"
                    value={letterboxd}
                    placeholder="votre-nom"
                    spellCheck={false}
                    autoCapitalize="none"
                    autoCorrect="off"
                    onChange={(event) => setLetterboxd(event.target.value)}
                  />
                </label>
                <p className="space-help">
                  Facultatif. Ouvre vos pages Letterboxd dans votre session. L’import du journal lit
                  une fois le flux RSS public du profil, à votre clic.
                </p>
                {letterboxdError ? (
                  <p className="space-error" role="alert">
                    {letterboxdError}
                  </p>
                ) : null}
                <p className="space-help">
                  Niveau de blocage, moteur de recherche, page de démarrage et historique restent
                  des réglages globaux : ils sont dans Réglages, pas ici.
                </p>
              </div>
            </details>

            {existing ? (
              <section className="space-section space-manage">
                <SectionTitle index={6} title="Gérer cet espace" />
                <div className="space-manage-actions">
                  <button
                    type="button"
                    className="space-manage-btn"
                    onClick={() => void duplicateSpace(existing.id)}
                  >
                    <Icon name="copy" size={13} />
                    Dupliquer l’espace
                  </button>
                  <button
                    type="button"
                    className="space-manage-btn"
                    onClick={() => setManageAction('clear')}
                  >
                    <Icon name="refresh" size={13} />
                    Vider les données…
                  </button>
                  {view.spaces.length > 1 ? (
                    <button
                      type="button"
                      className="space-manage-btn space-manage-danger"
                      onClick={() => setManageAction('delete')}
                    >
                      <Icon name="trash" size={13} />
                      Supprimer l’espace…
                    </button>
                  ) : null}
                </div>
                <p className="space-help">
                  Dupliquer copie les réglages et les sites, jamais les cookies ni l’historique.
                </p>

                {manageAction ? (
                  <div className="space-confirm" role="alertdialog" aria-modal="false">
                    <strong>
                      {manageAction === 'delete'
                        ? `Supprimer « ${existing.name} » ?`
                        : `Vider les données de « ${existing.name} » ?`}
                    </strong>
                    <p>
                      {manageAction === 'delete'
                        ? 'Ses onglets, ses cookies et son historique seront perdus. Cette action est définitive et ne peut pas être annulée.'
                        : 'Cookies, stockage, cache et historique de cet espace seront effacés. Ses réglages et sites épinglés restent. Action définitive.'}
                    </p>
                    <div className="space-confirm-actions">
                      <button
                        type="button"
                        className="space-small-btn"
                        onClick={() => setManageAction(null)}
                      >
                        Annuler
                      </button>
                      <button
                        type="button"
                        className="space-small-btn space-small-danger"
                        onClick={() => {
                          if (manageAction === 'delete') void removeSpace(existing.id)
                          else void clearSpaceData(existing.id)
                        }}
                      >
                        {manageAction === 'delete'
                          ? 'Supprimer définitivement'
                          : 'Vider définitivement'}
                      </button>
                    </div>
                  </div>
                ) : null}
              </section>
            ) : null}
          </div>

          <aside
            className="space-preview"
            data-mode={previewMode}
            data-bg={background}
            data-editing={photo ? 'true' : undefined}
            style={{ '--space-color': color } as CSSProperties}
            aria-label="Aperçu en direct de l’espace"
          >
            <div className="space-preview-top">
              <span className="space-preview-label">Aperçu en direct</span>
              <div className="space-mode" role="radiogroup" aria-label="Aperçu clair ou sombre">
                {(['light', 'dark'] as PreviewMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={previewMode === mode}
                    className="space-mode-btn"
                    data-active={previewMode === mode ? 'true' : undefined}
                    onClick={() => setPreviewMode(mode)}
                  >
                    <Icon name={mode === 'light' ? 'sun' : 'moon'} size={12} />
                    {mode === 'light' ? 'Clair' : 'Sombre'}
                  </button>
                ))}
              </div>
            </div>

            {photo ? (
              <div className="space-preview-editor">
                <SpaceAvatarEditor
                  src={photo}
                  color={color}
                  onAccept={(next) => {
                    setAvatar(next)
                    setAvatarSource('photo')
                    setPhoto(null)
                    setStarter(null)
                  }}
                  onCancel={() => {
                    setPhoto(null)
                    setPhotoError(null)
                  }}
                />
              </div>
            ) : (
              <>
                <div className="preview-window">
                  <div className="preview-rail">
                    <span className="preview-chip" data-active="true">
                      <SpaceAvatar space={{ name: previewName, color, avatar }} size={24} />
                    </span>
                    {otherSpaces.slice(0, 3).map((space) => (
                      <span key={space.id} className="preview-chip">
                        <SpaceAvatar space={space} size={24} />
                      </span>
                    ))}
                    <span className="preview-chip preview-chip-add">
                      <Icon name="plus" size={11} />
                    </span>
                  </div>

                  <div className="preview-app">
                    <div className="preview-bar">
                      <span className="preview-wordmark">
                        Vela<span>.</span>
                      </span>
                      <span className="preview-address" />
                    </div>
                    <div className="preview-body">
                      <div className="preview-side">
                        <div className="preview-space">
                          <SpaceAvatar space={{ name: previewName, color, avatar }} size={18} />
                          <span>{previewName}</span>
                        </div>
                        <span className="preview-brief" />
                        <span className="preview-tab" data-active="true">
                          Aujourd’hui
                        </span>
                        <span className="preview-tab">Notes</span>
                        <span className="preview-side-label">Sites épinglés</span>
                        <div className="preview-pins">
                          {shortcuts.slice(0, 5).map((shortcut) => (
                            <Favicon
                              key={shortcut.id}
                              url={shortcut.url}
                              label={shortcut.title}
                              size={13}
                              spaceId={iconSpaceId}
                              cacheOnly
                            />
                          ))}
                          {shortcuts.length > 5 ? (
                            <span className="preview-more">+{shortcuts.length - 5}</span>
                          ) : null}
                          {shortcuts.length === 0 ? (
                            <span className="preview-empty">Aucun site</span>
                          ) : null}
                        </div>
                      </div>
                      <div className="preview-page">
                        <span className="preview-hello">
                          Bonsoir<span>.</span>
                        </span>
                        <span className="preview-search">
                          <Icon name="search" size={9} />
                          Rechercher
                        </span>
                        <div className="preview-tiles">
                          {shortcuts.slice(0, 4).map((shortcut) => (
                            <span className="preview-tile" key={shortcut.id}>
                              <Favicon
                                url={shortcut.url}
                                label={shortcut.title}
                                size={14}
                                spaceId={iconSpaceId}
                                cacheOnly
                              />
                              <span>{shortcut.title}</span>
                            </span>
                          ))}
                          {shortcuts.length === 0 ? (
                            <>
                              <span className="preview-tile preview-tile-empty" />
                              <span className="preview-tile preview-tile-empty" />
                              <span className="preview-tile preview-tile-empty" />
                            </>
                          ) : null}
                        </div>
                        <span className="preview-lines">
                          <i />
                          <i />
                          <i />
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-preview-chips">
                  <span className="space-preview-chip">
                    <i style={{ background: color }} aria-hidden="true" />
                    {tintLabel}
                  </span>
                  <span className="space-preview-chip">{ambienceLabel}</span>
                  <span className="space-preview-chip">{countLabel(shortcuts.length)}</span>
                </div>
                <p className="space-preview-note">
                  Aperçu en direct — seule cette fenêtre prend la teinte et l’ambiance.
                </p>
              </>
            )}
          </aside>

          <div className="space-foot-wrap">
            {dirtyClose ? (
              <div
                className="space-discard"
                role="alertdialog"
                aria-label="Abandonner les modifications ?"
              >
                <span>Des modifications ne sont pas enregistrées.</span>
                <div className="space-discard-actions">
                  <button
                    type="button"
                    className="space-small-btn"
                    onClick={() => setDirtyClose(false)}
                  >
                    Continuer l’édition
                  </button>
                  <button
                    type="button"
                    className="space-small-btn space-small-danger"
                    onClick={() => setOverlay(null)}
                  >
                    Abandonner
                  </button>
                </div>
              </div>
            ) : null}
            <footer className="space-foot-v2">
              <p className="space-summary" aria-label="Résumé de l’espace">
                <i style={{ background: color }} aria-hidden="true" />
                {summary}
              </p>
              <div className="dialog-actions">
                <button type="button" className="action" onClick={requestClose}>
                  Annuler
                </button>
                <button
                  type="submit"
                  className="action primary"
                  disabled={saving || Boolean(letterboxdError)}
                >
                  <Icon name={existing ? 'check' : 'plus'} size={14} />
                  {existing ? 'Enregistrer' : 'Créer l’espace'}
                  <kbd className="space-kbd">⌘↵</kbd>
                </button>
              </div>
            </footer>
          </div>
        </form>

        <p className="sr-only" aria-live="polite">
          {liveMessage}
        </p>
        <span className="sr-only" aria-live="assertive">
          {nameProblem === 'duplicate'
            ? 'Ce nom est déjà utilisé.'
            : nameProblem === 'empty'
              ? 'Le nom est vide.'
              : ''}
        </span>
      </div>
    </div>
  )
}
