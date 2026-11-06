import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import { SPACE_COLORS, spaceTintFor } from '@shared/defaults'
import { presetById, fillAccent, type ThemeId } from '@shared/theme'
import {
  MAX_SHORTCUTS,
  SPACE_BACKGROUNDS,
  SPACE_PRESETS,
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
import { useModalFocus } from '../lib/useModalFocus'
import { useBrowser } from '../store/browser'
import SpaceAdvanced from './space/SpaceAdvanced'
import SpaceFooter from './space/SpaceFooter'
import SpaceHead from './space/SpaceHead'
import SpaceAppearance from './space/SpaceAppearance'
import SpaceManage, { type ManageAction } from './space/SpaceManage'
import SpaceNameSection from './space/SpaceNameSection'
import SpacePins from './space/SpacePins'
import SpacePreview, { type PreviewMode } from './space/SpacePreview'
import SpaceTemplates from './space/SpaceTemplates'
import { countLabel, sourceOf, type AvatarSource } from './space/spaceParts'

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

/**
 * Fenêtre de création et de modification d’un espace. L’état et les gestes
 * vivent ici ; les sections et l’aperçu sont des vues qui les reçoivent.
 */
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

  // L'état d'ouverture sert de référence à « modifié » : figé une fois, dans un
  // état — une référence ne se lit pas pendant un rendu.
  const [initial] = useState<DraftState>(() => ({
    name: existing?.name ?? '',
    color: existing?.color ?? SPACE_COLORS[(view?.spaces.length ?? 0) % SPACE_COLORS.length],
    avatar: existing?.avatar ?? null,
    background: existing?.background ?? 'none',
    shortcuts: [...(existing?.shortcuts ?? [])],
    blockTrackers: existing?.blockTrackers !== false,
    theme: existing?.theme ?? null,
    watchlist: existing?.watchlist === true,
    letterboxd: existing?.letterboxd ?? ''
  }))

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
  const tint = spaceTintFor(color)
  const tintLabel = tint?.label ?? 'Personnalisée'
  const ambienceLabel = SPACE_BACKGROUNDS.find((item) => item.id === background)?.label ?? 'Aucune'
  const iconSpaceId = existing?.id ?? view?.activeSpaceId ?? undefined
  const storedImage = avatarImage(avatar) ?? filePreview
  const storedFile = avatarFile(avatar)
  const dirty = comparable(draft) !== comparable(initial)
  const suggestedSet = shortcuts.length === 0 ? suggestShortcutSet(name) : null
  const suggestedLabel = suggestedSet
    ? (SPACE_PRESETS.find((preset) => preset.id === suggestedSet)?.label ?? 'ce type d’espace')
    : null

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
      // Hors du corps de l'effet : le compilateur React refuse un setState
      // synchrone ; la microtâche s'exécute avant la peinture.
      queueMicrotask(() => setFilePreview(null))
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

  // Fermer avec Échap passe par la même confirmation que la croix.
  const requestClose = (): void => {
    if (dirty && !dirtyClose) {
      setDirtyClose(true)
      return
    }
    setOverlay(null)
  }

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
    const blankColor = SPACE_COLORS[(view?.spaces.length ?? 0) % SPACE_COLORS.length]
    templateSnapshot.current = { draft: templateDraft(), starter }
    setColor(blankColor)
    setCustomInput(blankColor)
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

  const suggestPins = (): void => {
    if (!suggestedSet || !suggestedLabel) return
    setShortcuts(shortcutsForSet(suggestedSet))
    setStarter(null)
    setSiteError(null)
    announce(`Sites conseillés pour ${suggestedLabel} ajoutés.`)
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

  const removePin = (id: string): void => {
    setShortcuts((current) => current.filter((item) => item.id !== id))
    setStarter(null)
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

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
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

  const chooseName = (value: string): void => {
    setName(value)
    setNameTouched(true)
    inputRef.current?.focus()
  }

  const chooseAvatar = (value: string): void => {
    setAvatar(value)
    setStarter(null)
  }

  const chooseBackground = (value: SpaceBackground): void => {
    setBackground(value)
    setStarter(null)
  }

  const toggleCustom = (): void => {
    setCustomOpen((value) => !value)
    setStarter(null)
  }

  const changeCustomInput = (value: string): void => {
    setCustomInput(value)
    setTintError(null)
  }

  const removePhoto = (): void => {
    setAvatar('monogram')
    setAvatarSource('monogram')
    setStarter(null)
  }

  const acceptPhoto = (next: string): void => {
    setAvatar(next)
    setAvatarSource('photo')
    setPhoto(null)
    setStarter(null)
  }

  const cancelPhoto = (): void => {
    setPhoto(null)
    setPhotoError(null)
  }

  const setTint = (next: string): void => {
    setColor(next)
    setCustomInput(next)
    setCustomOpen(false)
    setTintError(null)
    setTintNotice(null)
    setStarter(null)
  }

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
        <SpaceHead existingName={existing?.name ?? null} onClose={requestClose} />

        <form ref={formRef} className="space-body" onSubmit={submit}>
          <div className="space-fields-v2">
            <SpaceNameSection
              name={name}
              onName={setName}
              onBlur={() => setNameTouched(true)}
              onSuggestion={chooseName}
              nameProblem={nameProblem}
              suggestedName={suggestedName}
              inputRef={inputRef}
            />

            <SpaceTemplates
              starter={starter}
              appliedTemplate={appliedTemplate}
              iconSpaceId={iconSpaceId}
              onBlank={applyBlank}
              onPreset={applyPreset}
              onRestore={restoreSnapshot}
            />

            <SpaceAppearance
              avatarSource={avatarSource}
              onSource={setAvatarSource}
              avatar={avatar}
              onAvatar={chooseAvatar}
              color={color}
              monogram={monogram}
              storedImage={storedImage}
              photo={photo}
              photoError={photoError}
              fileRef={fileRef}
              onImport={importPhoto}
              onRemovePhoto={removePhoto}
              onEditPhoto={setPhoto}
              tint={tint}
              tintError={tintError}
              tintNotice={tintNotice}
              customOpen={customOpen}
              customInput={customInput}
              onCustomInput={changeCustomInput}
              onToggleCustom={toggleCustom}
              onCommitTint={commitCustomTint}
              onTint={setTint}
              background={background}
              onBackground={chooseBackground}
            />

            <SpacePins
              pinsOpen={pinsOpen}
              onPinsOpen={setPinsOpen}
              shortcuts={shortcuts}
              suggestedSet={suggestedSet}
              suggestedLabel={suggestedLabel}
              existingId={existing?.id}
              dragId={dragId}
              dragIdRef={dragIdRef}
              dropTarget={dropTarget}
              onDragId={setDragId}
              onDropTarget={setDropTarget}
              pinRefs={pinRefs}
              siteInput={siteInput}
              onSiteInput={setSiteInput}
              siteError={siteError}
              onSiteError={setSiteError}
              onAddSite={addSite}
              onSuggest={suggestPins}
              onMovePin={movePin}
              onDropPin={dropPin}
              onDropAddress={dropAddress}
              onRemove={removePin}
            />

            <SpaceAdvanced
              open={advancedOpen}
              onOpen={setAdvancedOpen}
              blockTrackers={blockTrackers}
              onBlockTrackers={setBlockTrackers}
              theme={theme}
              onTheme={setTheme}
              perSpaceThemes={view.settings.perSpaceThemes}
              globalThemeLabel={presetById(view.settings.themeId)?.label ?? 'personnalisé'}
              watchlist={watchlist}
              onWatchlist={setWatchlist}
              letterboxd={letterboxd}
              onLetterboxd={setLetterboxd}
              letterboxdError={letterboxdError}
            />

            {existing ? (
              <SpaceManage
                space={existing}
                spaceCount={view.spaces.length}
                action={manageAction}
                onAction={setManageAction}
                onDuplicate={() => void duplicateSpace(existing.id)}
                onRemove={() => void removeSpace(existing.id)}
                onClear={() => void clearSpaceData(existing.id)}
              />
            ) : null}
          </div>

          <SpacePreview
            mode={previewMode}
            onMode={setPreviewMode}
            photo={photo}
            color={color}
            background={background}
            previewName={previewName}
            avatar={avatar}
            otherSpaces={otherSpaces}
            shortcuts={shortcuts}
            iconSpaceId={iconSpaceId}
            tintLabel={tintLabel}
            ambienceLabel={ambienceLabel}
            onAcceptPhoto={acceptPhoto}
            onCancelPhoto={cancelPhoto}
          />

          <SpaceFooter
            existingName={existing?.name ?? null}
            color={color}
            summary={summary}
            saving={saving}
            letterboxdError={letterboxdError}
            discardOpen={dirtyClose}
            onKeepEditing={() => setDirtyClose(false)}
            onDiscard={() => setOverlay(null)}
            onClose={requestClose}
          />
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
