import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { GALLERY_AVATARS } from '@shared/avatarGallery'
import { SPACE_COLORS, SPACE_TINTS } from '@shared/defaults'
import { THEME_PRESETS, presetById, type ThemeId } from '@shared/theme'
import {
  MAX_SHORTCUTS,
  SPACE_AVATARS,
  SPACE_BACKGROUNDS,
  SPACE_PRESETS,
  SPACE_SHORTCUT_SETS,
  avatarFile,
  avatarImage,
  normalizeShortcutUrl,
  normalizeLetterboxd,
  sanitizeSpaceShortcuts,
  shortcutsForSet,
  suggestShortcutSet,
  type SpaceBackground,
  type SpacePreset,
  type SpaceShortcut
} from '@shared/space'
import { hostOf } from '@shared/url'
import { useBrowser } from '../store/browser'
import Favicon from './Favicon'
import GalleryAvatar from './GalleryAvatar'
import { Icon } from './Icon'
import SpaceAvatar from './SpaceAvatar'
import SpaceAvatarEditor from './SpaceAvatarEditor'

/** Les quatre sources d’avatar, réunies derrière un seul sélecteur. */
type AvatarSource = 'monogram' | 'icons' | 'gallery' | 'photo'

const AVATAR_SOURCES: { id: AvatarSource; label: string }[] = [
  { id: 'monogram', label: 'Initiales' },
  { id: 'icons', label: 'Formes' },
  { id: 'gallery', label: 'Galerie' },
  { id: 'photo', label: 'Photo' }
]

/** La valeur stockée dit d’elle-même d’où vient l’avatar. */
function sourceOf(value: string | null): AvatarSource {
  if (!value || value === 'monogram') return 'monogram'
  if (value.startsWith('icon:')) return 'icons'
  if (value.startsWith('gallery:')) return 'gallery'
  return 'photo'
}

export default function SpaceDialog() {
  const view = useBrowser((state) => state.view)
  const editId = useBrowser((state) => state.spaceEditId)
  const setOverlay = useBrowser((state) => state.setOverlay)
  const createSpace = useBrowser((state) => state.createSpace)
  const updateSpace = useBrowser((state) => state.updateSpace)
  const removeSpace = useBrowser((state) => state.removeSpace)

  const existing = view?.spaces.find((space) => space.id === editId)
  const [name, setName] = useState(existing?.name ?? '')
  const [color, setColor] = useState(
    existing?.color ?? SPACE_COLORS[(view?.spaces.length ?? 0) % SPACE_COLORS.length]
  )
  const [avatar, setAvatar] = useState<string | null>(existing?.avatar ?? null)
  const [avatarSource, setAvatarSource] = useState<AvatarSource>(sourceOf(existing?.avatar ?? null))
  const [background, setBackground] = useState<SpaceBackground>(existing?.background ?? 'none')
  const [blockTrackers, setBlockTrackers] = useState(existing?.blockTrackers !== false)
  const [theme, setTheme] = useState<ThemeId | null>(existing?.theme ?? null)
  const [shortcuts, setShortcuts] = useState<SpaceShortcut[]>(existing?.shortcuts ?? [])
  const [watchlist, setWatchlist] = useState(existing?.watchlist === true)
  const [letterboxd, setLetterboxd] = useState(existing?.letterboxd ?? '')
  const [siteInput, setSiteInput] = useState('')
  const [siteError, setSiteError] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  // Le glisser-déposer enchaîne ses événements dans la même tâche : une ref
  // évite de dépendre d'un rendu entre le départ et le dépôt.
  const dragIdRef = useRef<string | null>(null)
  const [photo, setPhoto] = useState<string | null>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [filePreview, setFilePreview] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  // La photo peut être un fichier du dossier de données : on la relit pour
  // l'aperçu et le recadrage, sans la remettre dans vela.json.
  const storedFile = avatarFile(avatar)

  useEffect(() => {
    if (photo) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [photo])

  useEffect(() => {
    if (!storedFile) {
      setFilePreview(null)
      return
    }
    let alive = true
    void window.vela.avatars
      .read(storedFile)
      .then((data) => {
        if (alive) setFilePreview(data)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [storedFile])

  if (!view) return null

  const preview = name.trim() || `Espace ${view.spaces.length + 1}`
  const monogram = preview.slice(0, 1).toUpperCase()
  const activePreset =
    SPACE_PRESETS.find(
      (preset) => preset.color === color && preset.avatar === avatar && preset.background === background
    )?.id ?? null
  const storedImage = avatarImage(avatar) ?? filePreview

  const applyPreset = (preset: SpacePreset): void => {
    setName(preset.name)
    setColor(preset.color)
    setAvatar(preset.avatar)
    setAvatarSource(sourceOf(preset.avatar))
    setBackground(preset.background)
    setBlockTrackers(true)
    setShortcuts(shortcutsForSet(preset.id))
    // Le modèle cinéma arrive avec sa liste à voir : c'est le gadget qui donne
    // un sens à l'espace, et il reste facile à éteindre juste en dessous.
    setWatchlist(preset.id === 'cinema')
    setSiteError(null)
    setPhoto(null)
  }

  const suggestedSet = shortcuts.length === 0 ? suggestShortcutSet(name) : null
  const suggestedLabel = suggestedSet
    ? (SPACE_PRESETS.find((preset) => preset.id === suggestedSet)?.label ?? 'ce type d’espace')
    : null

  const addSite = (raw: string): void => {
    const url = normalizeShortcutUrl(raw)
    if (!url) {
      setSiteError('Adresse invalide — écrivez par exemple notion.so.')
      return
    }
    if (shortcuts.length >= MAX_SHORTCUTS) {
      setSiteError(`${MAX_SHORTCUTS} sites au maximum.`)
      return
    }
    if (shortcuts.some((shortcut) => shortcut.url === url)) {
      setSiteError('Ce site est déjà épinglé.')
      return
    }
    const [entry] = sanitizeSpaceShortcuts([{ url }])
    if (!entry) {
      setSiteError('Adresse refusée. Seuls les sites http et https sont acceptés.')
      return
    }
    setShortcuts((current) => [...current, entry])
    setSiteInput('')
    setSiteError(null)
  }

  const moveShortcut = (id: string, delta: number): void => {
    setShortcuts((current) => {
      const from = current.findIndex((item) => item.id === id)
      const to = from + delta
      if (from < 0 || to < 0 || to >= current.length) return current
      const next = [...current]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }

  const dropShortcut = (targetId: string): void => {
    const moving = dragIdRef.current
    if (!moving || moving === targetId) return
    setShortcuts((current) => {
      const from = current.findIndex((item) => item.id === moving)
      const to = current.findIndex((item) => item.id === targetId)
      if (from < 0 || to < 0) return current
      const next = [...current]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
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
    reader.onload = () => setPhoto(String(reader.result))
    reader.onerror = () => setPhotoError('Lecture de l’image impossible.')
    reader.readAsDataURL(file)
  }

  const letterboxdName = normalizeLetterboxd(letterboxd)
  const letterboxdError = letterboxd.trim() && !letterboxdName ? 'Nom de compte invalide — par exemple « votre-nom ».' : null
  const payload = {
    name: preview,
    color,
    avatar,
    background,
    blockTrackers,
    theme,
    shortcuts,
    watchlist,
    letterboxd: letterboxdName
  }

  return (
    <div className="overlay space-overlay" onMouseDown={() => setOverlay(null)}>
      <div
        className="sheet space-sheet immersive"
        role="dialog"
        aria-modal="true"
        aria-label="Espace"
        style={{ '--space-color': color } as CSSProperties}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="space-dialog-head">
          <div>
            <p className="eyebrow">
              <span className="eyebrow-dot" />
              {existing ? 'Personnaliser' : 'Nouvel espace'}
            </p>
            <h1>{existing ? existing.name : 'Un espace à part'}</h1>
            <p className="sheet-lede">
              Une identité, une ambiance, et ses propres cookies. Deux comptes au même site, sans conflit.
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={() => setOverlay(null)} title="Fermer">
            <Icon name="close" size={18} />
          </button>
        </header>

        <form
          className="space-layout"
          onSubmit={(event) => {
            event.preventDefault()
            if (existing) void updateSpace(existing.id, payload)
            else void createSpace(payload)
          }}
        >
          <aside
            className="space-stage"
            data-bg={background}
            data-editing={photo ? 'true' : undefined}
            style={{ '--space-color': color } as CSSProperties}
            aria-label="Aperçu de l’espace"
          >
            {photo ? (
              <SpaceAvatarEditor
                src={photo}
                color={color}
                onAccept={(next) => {
                  setAvatar(next)
                  setAvatarSource('photo')
                  setPhoto(null)
                }}
                onCancel={() => setPhoto(null)}
              />
            ) : (
              <>
                <div className="stage-window">
                  <div className="stage-rail">
                    <span className="stage-chip" data-active="true">
                      <SpaceAvatar space={{ name: preview, color, avatar }} size={20} />
                    </span>
                    {view.spaces
                      .filter((space) => space.id !== editId)
                      .slice(0, 2)
                      .map((space) => (
                        <span key={space.id} className="stage-chip">
                          <SpaceAvatar space={space} size={20} />
                        </span>
                      ))}
                    <span className="stage-chip stage-chip-add">
                      <Icon name="plus" size={11} />
                    </span>
                  </div>

                  <div className="stage-side">
                    <div className="stage-space">
                      <SpaceAvatar space={{ name: preview, color, avatar }} size={17} />
                      <span>{preview}</span>
                    </div>
                    <span className="stage-brief" />
                    <div className="stage-tabs">
                      <span className="stage-tab" data-active="true">
                        Nouvel onglet
                      </span>
                      <span className="stage-tab">Notes</span>
                      <span className="stage-tab">Recherche</span>
                    </div>
                  </div>

                  <div className="stage-page">
                    <span className="stage-address" />
                    <span className="stage-hello">
                      Bonsoir
                      <span className="stage-dot">.</span>
                    </span>
                    <span className="stage-field" />
                    <span className="stage-lines">
                      <i />
                      <i />
                      <i />
                    </span>
                    <div className="stage-cards">
                      <span />
                      <span />
                    </div>
                  </div>
                </div>
                <p className="stage-note">Aperçu en direct — le châssis prend cette teinte et cette ambiance.</p>
                <dl className="stage-facts">
                  <div>
                    <dt>Teinte</dt>
                    <dd>
                      <i style={{ background: color }} />
                      {SPACE_TINTS.find((tint) => tint.color.toLowerCase() === color.toLowerCase())?.label ??
                        color.toUpperCase()}
                    </dd>
                  </div>
                  <div>
                    <dt>Ambiance</dt>
                    <dd>{SPACE_BACKGROUNDS.find((preset) => preset.id === background)?.label ?? 'Aucune'}</dd>
                  </div>
                  <div>
                    <dt>Traqueurs</dt>
                    <dd>{blockTrackers ? 'Filtrés' : 'Non filtrés'}</dd>
                  </div>
                </dl>
              </>
            )}
          </aside>

          <div className="space-fields">
            {!existing && (
              <section className="space-block">
                <h2 className="space-block-title">Partir d’un modèle</h2>
                <div className="preset-grid">
                  {SPACE_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      className="preset-card"
                      data-active={activePreset === preset.id}
                      onClick={() => applyPreset(preset)}
                      style={{ '--preset': preset.color } as CSSProperties}
                    >
                      <span className="preset-mark">
                        <SpaceAvatar space={{ name: preset.label, color: preset.color, avatar: preset.avatar }} size={24} />
                      </span>
                      <span className="preset-copy">
                        <strong>{preset.label}</strong>
                        <small>
                          {SPACE_SHORTCUT_SETS[preset.id]?.length ?? 0} sites ·{' '}
                          {SPACE_BACKGROUNDS.find((item) => item.id === preset.background)?.label ?? 'fond du thème'}
                        </small>
                      </span>
                      {activePreset === preset.id && <Icon name="check" size={12} />}
                    </button>
                  ))}
                </div>
              </section>
            )}

            <section className="space-block">
              <h2 className="space-block-title">Identité</h2>
              <label className="field">
                <span>Nom</span>
                <input
                  ref={inputRef}
                  className="space-name-input"
                  value={name}
                  maxLength={40}
                  placeholder="Travail, Veille, Personnel…"
                  onChange={(event) => setName(event.target.value)}
                />
              </label>

              <div className="space-row">
                <span className="space-row-label" id="space-avatar-label">
                  Avatar
                </span>
                <div className="avatar-source" role="group" aria-labelledby="space-avatar-label">
                  {AVATAR_SOURCES.map((source) => (
                    <button
                      key={source.id}
                      type="button"
                      className="avatar-source-btn"
                      data-active={avatarSource === source.id}
                      aria-pressed={avatarSource === source.id}
                      onClick={() => setAvatarSource(source.id)}
                    >
                      {source.label}
                    </button>
                  ))}
                </div>

                {avatarSource === 'monogram' && (
                  <button
                    type="button"
                    className="avatar-choice avatar-choice-wide"
                    data-active={!avatar || avatar === 'monogram'}
                    aria-pressed={!avatar || avatar === 'monogram'}
                    onClick={() => setAvatar('monogram')}
                    title="Initiales de l’espace"
                  >
                    <span className="avatar-choice-mono" style={{ background: color }}>
                      {monogram}
                    </span>
                    <span className="avatar-choice-copy">
                      <strong>Initiales</strong>
                      <small>La lettre du nom, sur la teinte choisie</small>
                    </span>
                    {(!avatar || avatar === 'monogram') && <Icon name="check" size={12} />}
                  </button>
                )}

                {avatarSource === 'icons' && (
                  <div className="avatar-grid" role="group" aria-label="Formes">
                    {SPACE_AVATARS.map((mark) => (
                      <button
                        key={mark.id}
                        type="button"
                        className="avatar-choice"
                        data-active={avatar === `icon:${mark.id}`}
                        aria-pressed={avatar === `icon:${mark.id}`}
                        onClick={() => setAvatar(`icon:${mark.id}`)}
                        title={mark.label}
                        aria-label={mark.label}
                      >
                        <svg viewBox="0 0 24 24" width={16} height={16} aria-hidden="true">
                          <path
                            d={mark.path}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={1.7}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    ))}
                  </div>
                )}

                {avatarSource === 'gallery' && (
                  <div className="avatar-panel">
                    <div className="avatar-gallery" role="group" aria-label="Avatars de la galerie">
                      {GALLERY_AVATARS.map((entry) => (
                        <button
                          key={entry.id}
                          type="button"
                          className="avatar-gallery-choice"
                          data-active={avatar === `gallery:${entry.id}`}
                          aria-pressed={avatar === `gallery:${entry.id}`}
                          title={entry.label}
                          aria-label={entry.label}
                          onClick={() => setAvatar(`gallery:${entry.id}`)}
                        >
                          <GalleryAvatar id={entry.id} initial={monogram} size={26} />
                        </button>
                      ))}
                    </div>
                    <p className="avatar-gallery-caption">
                      {GALLERY_AVATARS.length} avatars dessinés dans Vela, enregistrés avec l’espace, sans requête
                      réseau.
                    </p>
                  </div>
                )}

                {avatarSource === 'photo' && (
                  <div className="avatar-panel">
                    <div className="avatar-photo-row">
                      <span className="avatar-photo-preview" data-empty={storedImage ? undefined : 'true'}>
                        {storedImage ? (
                          <img src={storedImage} alt="Photo de profil de l’espace" />
                        ) : (
                          <Icon name="image" size={18} />
                        )}
                      </span>
                      <span className="avatar-photo-copy">
                        <strong>{storedImage ? 'Photo importée' : 'Aucune photo'}</strong>
                        <small>PNG, JPEG ou WebP, 8 Mo au plus, recadrée en carré</small>
                      </span>
                      <button type="button" className="photo-btn" onClick={() => fileRef.current?.click()}>
                        <Icon name="image" size={12} />
                        {storedImage ? 'Remplacer' : 'Importer une photo'}
                      </button>
                    </div>

                    {storedImage && !photo && (
                      <div className="avatar-photo-actions">
                        <button type="button" className="text-btn" onClick={() => setPhoto(storedImage)}>
                          <Icon name="edit" size={11} />
                          Recadrer
                        </button>
                        <button
                          type="button"
                          className="text-btn"
                          onClick={() => {
                            setAvatar('monogram')
                            setAvatarSource('monogram')
                          }}
                        >
                          <Icon name="trash" size={11} />
                          Retirer la photo
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {photoError && <p className="space-error">{photoError}</p>}

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
            </section>

            <section className="space-block">
              <h2 className="space-block-title">Couleur et ambiance</h2>
              <div className="space-row">
                <span className="space-row-label" id="space-tint-label">
                  Teinte
                </span>
                <div className="space-swatches" role="group" aria-labelledby="space-tint-label">
                  {SPACE_TINTS.map((tint) => {
                    const active = tint.color.toLowerCase() === color.toLowerCase()
                    return (
                      <button
                        type="button"
                        key={tint.id}
                        className="swatch"
                        data-active={active}
                        aria-pressed={active}
                        onClick={() => setColor(tint.color)}
                      >
                        <span className="swatch-dot" style={{ background: tint.color }} aria-hidden="true">
                          {active && <Icon name="check" size={10} />}
                        </span>
                        <span className="swatch-label">{tint.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="space-row">
                <span className="space-row-label">Ambiance</span>
                <div className="background-grid">
                {SPACE_BACKGROUNDS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className="background-card"
                    data-active={background === preset.id}
                    data-bg={preset.id}
                    style={{ '--space-color': color } as CSSProperties}
                    onClick={() => setBackground(preset.id)}
                    title={preset.detail}
                    aria-pressed={background === preset.id}
                  >
                    <span className="background-swatch" />
                    <span>{preset.label}</span>
                  </button>
                ))}
                </div>
              </div>
            </section>

            <section className="space-block">
              <div className="block-head">
                <h2 className="space-block-title">Sites épinglés</h2>
                <span className="block-count">
                  {shortcuts.length}/{MAX_SHORTCUTS}
                </span>
              </div>

              {suggestedSet && suggestedLabel ? (
                <button
                  type="button"
                  className="pins-suggest"
                  onClick={() => {
                    setShortcuts(shortcutsForSet(suggestedSet))
                    setSiteError(null)
                  }}
                >
                  <Icon name="sparkles" size={12} />
                  Ajouter les {SPACE_SHORTCUT_SETS[suggestedSet]?.length ?? 0} sites conseillés pour {suggestedLabel}
                </button>
              ) : null}

              {shortcuts.length > 0 ? (
                <ul className="pin-edit-list">
                  {shortcuts.map((shortcut, index) => (
                    <li
                      key={shortcut.id}
                      draggable
                      data-drag={dragId === shortcut.id ? 'true' : undefined}
                      data-over={dropTarget === shortcut.id ? 'true' : undefined}
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
                        dropShortcut(shortcut.id)
                      }}
                    >
                      <span className="pin-grip" aria-hidden="true" />
                      <Favicon url={shortcut.url} label={shortcut.title} size={16} spaceId={editId ?? undefined} />
                      <span className="pin-edit-copy">
                        <strong>{shortcut.title}</strong>
                        <small>{hostOf(shortcut.url)}</small>
                      </span>
                      <span className="pin-edit-move">
                        <button
                          type="button"
                          onClick={() => moveShortcut(shortcut.id, -1)}
                          disabled={index === 0}
                          aria-label={`Monter ${shortcut.title}`}
                          title="Monter"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moveShortcut(shortcut.id, 1)}
                          disabled={index === shortcuts.length - 1}
                          aria-label={`Descendre ${shortcut.title}`}
                          title="Descendre"
                        >
                          ↓
                        </button>
                      </span>
                      <button
                        type="button"
                        className="pin-edit-remove"
                        aria-label={`Retirer ${shortcut.title}`}
                        title={`Retirer ${shortcut.title}`}
                        onClick={() =>
                          setShortcuts((current) => current.filter((item) => item.id !== shortcut.id))
                        }
                      >
                        <Icon name="close" size={11} />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}

              <div className="pin-add">
                <input
                  className="pin-add-input"
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
                <button type="button" className="text-btn" onClick={() => addSite(siteInput)}>
                  <Icon name="plus" size={12} />
                  Épingler
                </button>
              </div>
              {siteError ? <p className="space-error">{siteError}</p> : null}
              <p className="setting-hint">
                Propres à cet espace, visibles sur sa page d’accueil. Glissez une ligne pour changer l’ordre, ou
                une adresse depuis la page pour l’ajouter.
              </p>
            </section>

            <section className="space-block">
              <h2 className="space-block-title">Gadgets</h2>

              <div className="isolation-toggle">
                <div>
                  <span>Liste à voir</span>
                  <small>Une carte sur l’accueil de cet espace : titres à voir et tirage « Ce soir ».</small>
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
              <p className="setting-hint">
                Facultatif. Ouvre vos pages Letterboxd — films vus, journal, liste — dans votre session. Si vous
                cliquez sur « Importer le journal » sur l’accueil, Vela lit le flux RSS public du profil sur
                letterboxd.com : un clic, aucun cookie, rien au démarrage.
              </p>
              {letterboxdError ? <p className="space-error">{letterboxdError}</p> : null}
            </section>

            <section className="space-block isolation-block">
              <h2 className="space-block-title">Isolation</h2>
              <div className="isolation-note">
                <span className="isolation-icon">
                  <Icon name="shield" size={14} />
                </span>
                <div>
                  <strong>Cookies et sessions séparés</strong>
                  <span>Chaque espace a sa partition Chromium : cache, stockage et connexions isolés.</span>
                </div>
              </div>
              <div className="isolation-toggle">
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
            </section>

            {view.settings.perSpaceThemes ? (
              <section className="space-block">
                <h2 className="space-block-title">Thème de cet espace</h2>
                <label className="field">
                  <span>Thème de couleur</span>
                  <select
                    className="select"
                    value={theme ?? ''}
                    onChange={(event) => setTheme((event.target.value || null) as ThemeId | null)}
                  >
                    <option value="">Thème global ({presetById(view.settings.themeId)?.label ?? 'personnalisé'})</option>
                    {THEME_PRESETS.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.label}
                      </option>
                    ))}
                    <option value="custom">Couleur personnalisée</option>
                  </select>
                </label>
              </section>
            ) : (
              <p className="setting-hint">
                Un thème de couleur par espace s’active dans Réglages › Apparence.
              </p>
            )}
          </div>

          <footer className="dialog-foot space-foot">
            {existing && view.spaces.length > 1 ? (
              <button
                type="button"
                className="danger-btn"
                data-confirming={confirming}
                onClick={() => {
                  if (!confirming) {
                    setConfirming(true)
                    return
                  }
                  void removeSpace(existing.id)
                }}
              >
                {confirming ? 'Confirmer la suppression' : 'Supprimer cet espace'}
              </button>
            ) : (
              <span />
            )}
            <div className="dialog-actions">
              <button type="button" className="action" onClick={() => setOverlay(null)}>
                Annuler
              </button>
              <button type="submit" className="action primary" disabled={Boolean(letterboxdError)}>
                <Icon name={existing ? 'check' : 'plus'} size={14} />
                {existing ? 'Enregistrer' : 'Créer l’espace'}
              </button>
            </div>
          </footer>
        </form>
      </div>
    </div>
  )
}
