import { useId, useState, type CSSProperties } from 'react'
import {
  ACCENT_THEMES,
  SKY_THEME,
  adjustAccent,
  hexToRgb,
  parseHex,
  presetPalette,
  readableOn,
  resolveAccent,
  rgbToHex,
  type ResolvedMode,
  type Rgb,
  type ThemeId
} from '@shared/theme'
import type { SettingsPatch } from '@shared/api'
import type { Settings } from '@shared/types'
import { swatchColor } from '../../lib/appearance'
import { useBrowser } from '../../store/browser'
import { Icon } from '../Icon'

/**
 * Section « Couleur » commune à Apparence et à Tweaks.
 *
 * La palette garde le comportement historique : une teinte d'accent, une
 * teinte libre en HEX ou RVB, et une coche sur la pastille active. Quand un
 * espace porte sa propre teinte, un sélecteur de portée permet de la changer
 * ici, sans ouvrir la fenêtre de l'espace. Le nom accessible de chaque pastille
 * reste son libellé, jamais sa seule couleur.
 */
export default function AccentColorSection({
  settings,
  mode,
  updateSettings,
  className = 'appearance-section',
  title = 'Couleur',
  help = 'Une seule teinte, déclinée sur tout le châssis. Le contenu des sites n’est jamais recoloré.',
  anchor
}: {
  settings: Settings
  mode: ResolvedMode
  updateSettings: (patch: SettingsPatch) => Promise<void>
  className?: string
  title?: string
  help?: string
  anchor?: string
}) {
  const sectionId = useId()
  const [colorNote, setColorNote] = useState<{ text: string; tone: 'info' | 'error' } | null>(null)
  const [draft, setDraft] = useState<{ from: string; rgb: Rgb } | null>(null)
  const [rgbNote, setRgbNote] = useState<string | null>(null)
  /** Portée de l'édition : toute l'application, ou l'espace actif seul. */
  const [scope, setScope] = useState<'global' | 'space'>('global')
  const rgb =
    draft && draft.from === settings.customAccent ? draft.rgb : hexToRgb(settings.customAccent)

  const view = useBrowser((state) => state.view)
  const updateSpace = useBrowser((state) => state.updateSpace)
  const activeSpace = view?.spaces.find((space) => space.id === view.activeSpaceId) ?? null
  // Éditer un espace n'a de sens que si les apparences par espace sont actives
  // et qu'un espace est réellement ouvert.
  const canScope = Boolean(activeSpace) && settings.perSpaceThemes
  const spaceMode = scope === 'space' && canScope
  const spaceAccent = activeSpace?.accent ?? null

  /**
   * L'accent que le châssis applique vraiment : un espace peut porter la sienne,
   * et elle l'emporte sur le réglage global. La grille le signale d'une marque,
   * sinon la pastille cochée ne dit pas ce qui est à l'écran.
   */
  const applied = resolveAccent({
    globalAccent: settings.customAccent,
    globalOverride: settings.accentOverride,
    perSpace: settings.perSpaceThemes,
    spaceAccent: activeSpace?.accent ?? null
  })
  const appliedHex = applied.accentOverride ? applied.customAccent.toLowerCase() : null
  const presetApplied = (id: ThemeId): boolean =>
    appliedHex !== null && swatchColor(id, settings.customAccent, mode).toLowerCase() === appliedHex
  const spaceAccentKey = spaceAccent?.toLowerCase() ?? null
  const customApplied = spaceMode
    ? spaceAccentKey !== null &&
      !ACCENT_THEMES.some(
        (preset) => swatchColor(preset.id, settings.customAccent, mode).toLowerCase() === spaceAccentKey
      )
    : appliedHex !== null && !ACCENT_THEMES.some((preset) => presetApplied(preset.id))

  /** Écrit la teinte à la bonne portée. */
  const writeAccent = (hex: string): void => {
    if (spaceMode && activeSpace) {
      void updateSpace(activeSpace.id, { accent: hex })
      return
    }
    void updateSettings({ customAccent: hex, accentOverride: true })
  }

  const applyCustom = (value: string): void => {
    const parsed = parseHex(value)
    if (!parsed) {
      setColorNote({ text: 'Couleur invalide : utilisez un code #RRGGBB.', tone: 'error' })
      return
    }
    // Le papier du thème est la surface réelle derrière l'accent : c'est
    // contre lui que la teinte libre doit rester lisible. Choisir une couleur
    // ne change donc ni le papier ni le lavis du thème.
    const palette = presetPalette({
      themeId: spaceMode && activeSpace ? (activeSpace.theme ?? settings.themeId) : settings.themeId,
      customAccent: settings.customAccent,
      mode
    })
    const result = adjustAccent(parsed, mode, palette[mode].paper)
    writeAccent(result.color)
    const where = spaceMode && activeSpace ? `pour « ${activeSpace.name} »` : ''
    setColorNote(
      result.adjusted && result.reason
        ? { text: result.reason, tone: 'info' }
        : { text: `Couleur appliquée ${where}: ${result.color.toUpperCase()}.`, tone: 'info' }
    )
  }

  const chooseTheme = (id: ThemeId): void => {
    const patch: SettingsPatch = { themeId: id, accentOverride: id === 'custom' }
    // Le ciel n'appartient qu'au thème Braise : un autre thème de couleur
    // revient au dégradé pour ne pas laisser un fond inactif.
    if (id !== SKY_THEME && settings.homeBackground === 'sky') patch.homeBackground = 'gradient'
    setColorNote(null)
    void updateSettings(patch)
  }

  /**
   * Clic sur une pastille. En portée « Cet espace », la pastille est un thème
   * complet — papier, lavis et accent de l'espace — et une teinte libre
   * éventuelle tombe, sinon la pastille ne dirait pas ce que l'espace affiche.
   */
  const choosePresetAccent = (id: ThemeId): void => {
    if (spaceMode && activeSpace) {
      setColorNote(null)
      void updateSpace(activeSpace.id, { theme: id, accent: null })
      return
    }
    chooseTheme(id)
  }

  const chooseCustom = (): void => {
    if (spaceMode && activeSpace) {
      setColorNote(null)
      void updateSpace(activeSpace.id, { accent: settings.customAccent })
      return
    }
    chooseTheme('custom')
  }

  const clearSpaceAccent = (): void => {
    if (!activeSpace) return
    setColorNote(null)
    void updateSpace(activeSpace.id, { accent: null })
  }

  const clearSpaceTheme = (): void => {
    if (!activeSpace) return
    setColorNote(null)
    void updateSpace(activeSpace.id, { theme: null })
  }

  const commitRgb = (): void => {
    const next = rgbToHex(rgb)
    setRgbNote(
      next.toUpperCase() === settings.customAccent.toUpperCase()
        ? null
        : `Appliqué : ${next.toUpperCase()}`
    )
    applyCustom(next)
  }

  const channel = (key: 'r' | 'g' | 'b', value: string): void => {
    const parsed = Number(value)
    setDraft({
      from: settings.customAccent,
      rgb: { ...rgb, [key]: Number.isFinite(parsed) ? parsed : 0 }
    })
  }

  const customActive = spaceMode
    ? customApplied
    : settings.accentOverride || settings.themeId === 'custom'

  return (
    <section className={className} aria-labelledby={sectionId} data-settings-anchor={anchor}>
      <div className="setting-head">
        <h2 id={sectionId}>{title}</h2>
        <p>{help}</p>
      </div>

      {canScope ? (
        <div className="theme-scope-block">
          <div className="theme-scope" role="group" aria-label="Portée de l’accent">
            <button
              type="button"
              aria-pressed={scope === 'global'}
              data-active={scope === 'global'}
              onClick={() => setScope('global')}
            >
              Global
            </button>
            <button
              type="button"
              aria-pressed={scope === 'space'}
              data-active={scope === 'space'}
              onClick={() => setScope('space')}
            >
              Ce profil
            </button>
          </div>
          <p className="app-help">
            {spaceMode
              ? `Thème et accent de « ${activeSpace?.name} » seulement.`
              : 'Thème et accent de toute l’application.'}
          </p>
          {spaceMode && activeSpace?.theme ? (
            <button type="button" className="link-btn" onClick={clearSpaceTheme}>
              Revenir au thème global
            </button>
          ) : null}
          {spaceMode && spaceAccent ? (
            <button type="button" className="link-btn" onClick={clearSpaceAccent}>
              Revenir à l’accent global
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="theme-grid" role="group" aria-label="Palette d’accentuation">
        {ACCENT_THEMES.map((preset) => {
          const teinte = swatchColor(preset.id, settings.customAccent, mode)
          const active = spaceMode
            ? activeSpace?.theme === preset.id
            : settings.themeId === preset.id && !settings.accentOverride
          const appliedToPreset = spaceMode ? active : presetApplied(preset.id)
          return (
            <button
              type="button"
              key={preset.id}
              aria-pressed={active}
              aria-label={
                appliedToPreset ? `${preset.label} — accent du profil actif` : preset.label
              }
              className="theme-dot"
              data-active={active}
              data-applied={appliedToPreset ? 'true' : 'false'}
              style={{ '--swatch': teinte, '--swatch-ink': readableOn(teinte) } as CSSProperties}
              onClick={() => choosePresetAccent(preset.id)}
            >
              <span className="theme-dot-disc">{active && <Icon name="check" size={15} />}</span>
              <span className="theme-dot-name">{preset.label}</span>
            </button>
          )
        })}
        <button
          type="button"
          aria-pressed={customActive}
          aria-label={
            customApplied ? 'Teinte personnalisée — accent du profil actif' : 'Teinte personnalisée'
          }
          className="theme-dot"
          data-active={customActive}
          data-applied={customApplied ? 'true' : 'false'}
          style={
            {
              '--swatch': settings.customAccent,
              '--swatch-ink': readableOn(settings.customAccent)
            } as CSSProperties
          }
          onClick={chooseCustom}
        >
          <span className="theme-dot-disc">{customActive && <Icon name="check" size={15} />}</span>
          <span className="theme-dot-name">Personnalisé</span>
        </button>
      </div>

      <div className="theme-custom" data-active={customActive}>
        <span
          className="theme-custom-swatch"
          style={{ '--swatch': settings.customAccent } as CSSProperties}
          aria-hidden="true"
        />
        <div className="theme-custom-copy">
          <span className="theme-custom-name">Teinte libre</span>
          <span className="theme-custom-hint">
            Saisie en HEX ou en RVB : elle remplace l’accent, le papier et le lavis du thème restent.
          </span>
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
            className="custom-color-hex"
            aria-label="Code hexadécimal de la couleur"
            key={settings.customAccent}
            defaultValue={settings.customAccent.toUpperCase()}
            spellCheck={false}
            autoComplete="off"
            onBlur={(event) => applyCustom(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return
              event.preventDefault()
              applyCustom(event.currentTarget.value)
            }}
          />
        </div>
        {customActive && (
          <span className="theme-custom-state">
            <Icon name="check" size={12} />
            Active
          </span>
        )}
      </div>

      <div className="rgb-field" role="group" aria-label="Teinte libre en rouge, vert, bleu">
        <span className="rgb-field-label">RVB</span>
        {(['r', 'g', 'b'] as const).map((key) => (
          <label key={key} className="rgb-channel">
            <span>{key.toUpperCase()}</span>
            <input
              type="number"
              min={0}
              max={255}
              step={1}
              inputMode="numeric"
              value={rgb[key]}
              onChange={(event) => channel(key, event.target.value)}
              onBlur={commitRgb}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return
                event.preventDefault()
                commitRgb()
              }}
            />
          </label>
        ))}
        <span
          className="rgb-preview"
          style={{ '--swatch': rgbToHex(rgb) } as CSSProperties}
          aria-hidden="true"
        />
      </div>

      {colorNote && (
        <p className="custom-color-note" data-tone={colorNote.tone} role="status">
          {colorNote.text}
        </p>
      )}
      {rgbNote && !colorNote && <p className="custom-color-note">{rgbNote}</p>}
    </section>
  )
}
