import { useId, useState, type CSSProperties } from 'react'
import {
  ACCENT_THEMES,
  SKY_THEME,
  adjustAccent,
  hexToRgb,
  parseHex,
  readableOn,
  rgbToHex,
  type ResolvedMode,
  type Rgb,
  type ThemeId
} from '@shared/theme'
import type { SettingsPatch } from '@shared/api'
import type { Settings } from '@shared/types'
import { swatchColor } from '../lib/appearance'
import { Icon } from './Icon'

/**
 * Section « Couleur » commune à Apparence et à Tweaks.
 *
 * La palette garde le comportement historique : une teinte d'accent, une
 * teinte libre en HEX ou RVB, et une coche sur la pastille active. Le nom
 * accessible de chaque pastille reste son libellé, jamais sa seule couleur.
 */
export default function AccentColorSection({
  settings,
  mode,
  updateSettings,
  className = 'appearance-section',
  title = 'Couleur',
  help = 'Une seule teinte, déclinée sur tout le châssis. Le contenu des sites n’est jamais recoloré.'
}: {
  settings: Settings
  mode: ResolvedMode
  updateSettings: (patch: SettingsPatch) => Promise<void>
  className?: string
  title?: string
  help?: string
}) {
  const sectionId = useId()
  const [colorNote, setColorNote] = useState<{ text: string; tone: 'info' | 'error' } | null>(null)
  const [draft, setDraft] = useState<{ from: string; rgb: Rgb } | null>(null)
  const [rgbNote, setRgbNote] = useState<string | null>(null)
  const rgb = draft && draft.from === settings.customAccent ? draft.rgb : hexToRgb(settings.customAccent)

  const applyCustom = (value: string): void => {
    const parsed = parseHex(value)
    if (!parsed) {
      setColorNote({ text: 'Couleur invalide : utilisez un code #RRGGBB.', tone: 'error' })
      return
    }
    const result = adjustAccent(parsed, mode)
    void updateSettings({ customAccent: result.color, themeId: 'custom' })
    setColorNote(
      result.adjusted && result.reason
        ? { text: result.reason, tone: 'info' }
        : { text: `Couleur appliquée : ${result.color.toUpperCase()}.`, tone: 'info' }
    )
  }

  const chooseTheme = (id: ThemeId): void => {
    const patch: SettingsPatch = { themeId: id }
    // Le ciel n'appartient qu'au thème Braise : un autre thème de couleur
    // revient au dégradé pour ne pas laisser un fond inactif.
    if (id !== SKY_THEME && settings.homeBackground === 'sky') patch.homeBackground = 'gradient'
    setColorNote(null)
    void updateSettings(patch)
  }

  const commitRgb = (): void => {
    const next = rgbToHex(rgb)
    setRgbNote(next.toUpperCase() === settings.customAccent.toUpperCase() ? null : `Appliqué : ${next.toUpperCase()}`)
    applyCustom(next)
  }

  const channel = (key: 'r' | 'g' | 'b', value: string): void => {
    const parsed = Number(value)
    setDraft({
      from: settings.customAccent,
      rgb: { ...rgb, [key]: Number.isFinite(parsed) ? parsed : 0 }
    })
  }

  return (
    <section className={className} aria-labelledby={sectionId}>
      <div className="setting-head">
        <h2 id={sectionId}>{title}</h2>
        <p>{help}</p>
      </div>

      <div className="theme-grid" role="group" aria-label="Palette d’accentuation">
        {ACCENT_THEMES.map((preset) => {
          const active = settings.themeId === preset.id
          const teinte = swatchColor(preset.id, settings.customAccent, mode)
          return (
            <button
              type="button"
              key={preset.id}
              aria-pressed={active}
              aria-label={preset.label}
              className="theme-dot"
              data-active={active}
              style={{ '--swatch': teinte, '--swatch-ink': readableOn(teinte) } as CSSProperties}
              onClick={() => chooseTheme(preset.id)}
            >
              <span className="theme-dot-disc">{active && <Icon name="check" size={15} />}</span>
              <span className="theme-dot-name">{preset.label}</span>
            </button>
          )
        })}
        <button
          type="button"
          aria-pressed={settings.themeId === 'custom'}
          aria-label="Teinte personnalisée"
          className="theme-dot"
          data-active={settings.themeId === 'custom'}
          style={
            {
              '--swatch': settings.customAccent,
              '--swatch-ink': readableOn(settings.customAccent)
            } as CSSProperties
          }
          onClick={() => chooseTheme('custom')}
        >
          <span className="theme-dot-disc">
            {settings.themeId === 'custom' && <Icon name="check" size={15} />}
          </span>
          <span className="theme-dot-name">Personnalisé</span>
        </button>
      </div>

      <div className="theme-custom" data-active={settings.themeId === 'custom'}>
        <span
          className="theme-custom-swatch"
          style={{ '--swatch': settings.customAccent } as CSSProperties}
          aria-hidden="true"
        />
        <div className="theme-custom-copy">
          <span className="theme-custom-name">Teinte libre</span>
          <span className="theme-custom-hint">
            Saisie en HEX ou en RVB, elle prend la case « Personnalisé ».
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
        {settings.themeId === 'custom' && (
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
