import { useState, type CSSProperties } from 'react'
import {
  MAX_GLASS_BLUR,
  THEME_PRESETS,
  hexToRgb,
  readableOn,
  rgbToHex,
  type ResolvedMode,
  type Rgb
} from '@shared/theme'
import type { SettingsPatch } from '@shared/api'
import type { Settings } from '@shared/types'
import { swatchColor } from '../lib/appearance'
import { spawnRipple, trackGlow } from '../lib/motion'
import { Icon } from './Icon'

/**
 * Page « Tweaks » des réglages : les réglages fins, séparés des ambiances.
 *
 * Trois blocs seulement — la palette d'accents pures, la teinte libre réglable
 * en HEX ou en RVB, et l'intensité du verre dépoli. L'ambiance animée vit dans
 * sa propre page (Thèmes) : un accent ne déclenche aucune animation.
 */
export default function TweaksPage({
  mode,
  settings,
  updateSettings,
  applyCustom,
  resetAppearance,
  hexNote
}: {
  mode: ResolvedMode
  settings: Settings
  updateSettings: (patch: SettingsPatch) => Promise<void>
  applyCustom: (value: string) => void
  resetAppearance: () => void
  hexNote: { text: string; tone: 'info' | 'error' } | null
}) {
  // Les canaux se dérivent de la valeur retenue, sauf pendant une saisie : le
  // brouillon est étiqueté par la couleur dont il part, donc il s'efface de
  // lui-même quand le thème change, sans effet de synchronisation.
  const [draft, setDraft] = useState<{ from: string; rgb: Rgb } | null>(null)
  const [rgbNote, setRgbNote] = useState<string | null>(null)
  const rgb = draft && draft.from === settings.customAccent ? draft.rgb : hexToRgb(settings.customAccent)

  const commitRgb = (): void => {
    const hex = rgbToHex(rgb)
    setRgbNote(hex.toUpperCase() === settings.customAccent.toUpperCase() ? null : `Appliqué : ${hex.toUpperCase()}`)
    applyCustom(hex)
  }

  const channel = (key: 'r' | 'g' | 'b', value: string): void => {
    const parsed = Number(value)
    setDraft({
      from: settings.customAccent,
      rgb: { ...rgb, [key]: Number.isFinite(parsed) ? parsed : 0 }
    })
  }

  return (
    <section className="setting-block">
      <div className="setting-head">
        <h2>Accent</h2>
        <p>
          Une seule teinte, déclinée sur tout le châssis. Le contenu des sites n’est jamais recoloré.
        </p>
      </div>
      {/* Douze cases : onze teintes et la teinte libre. La grille se remplit
          sans trou à six colonnes comme à quatre. */}
      <div className="theme-grid" role="group" aria-label="Palette d’accentuation">
        {THEME_PRESETS.map((preset) => {
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
              onPointerMove={trackGlow}
              onClick={() => void updateSettings({ themeId: preset.id })}
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
          onPointerMove={trackGlow}
          onClick={() => void updateSettings({ themeId: 'custom' })}
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
          <span className="theme-custom-hint">Saisie en HEX ou en RVB, elle prend la case « Personnalisé ».</span>
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
                if (event.key === 'Enter') {
                  event.preventDefault()
                  commitRgb()
                }
              }}
            />
          </label>
        ))}
        <span className="rgb-preview" style={{ '--swatch': rgbToHex(rgb) } as CSSProperties} aria-hidden="true" />
      </div>

      {hexNote && (
        <p className="custom-color-note" data-tone={hexNote.tone}>
          {hexNote.text}
        </p>
      )}
      {rgbNote && !hexNote && <p className="custom-color-note">{rgbNote}</p>}

      <div className="setting-head tweak-head">
        <h2>Verre dépoli</h2>
        <p>
          Intensité du flou d’arrière-plan sur les panneaux. Zéro rend le verre net, quarante le
          rend laiteux. Le flou reste confiné au châssis.
        </p>
      </div>
      <div className="tweak-slider">
        <label className="tweak-slider-head" htmlFor="glass-blur">
          <span>Intensité</span>
          <span className="tweak-slider-value">{settings.glassBlur} px</span>
        </label>
        <input
          id="glass-blur"
          className="tweak-range"
          type="range"
          min={0}
          max={MAX_GLASS_BLUR}
          step={1}
          value={settings.glassBlur}
          aria-valuetext={`${settings.glassBlur} pixels de flou`}
          onChange={(event) => void updateSettings({ glassBlur: Number(event.target.value) })}
        />
        <div className="tweak-scale" aria-hidden="true">
          <span>Net</span>
          <span>Laiteux</span>
        </div>
      </div>

      {/* Trois plaques de verre superposées : la profondeur se voit avant de
          choisir, sans ouvrir une autre fenêtre. */}
      <div className="glass-demo">
        <span className="glass-demo-orb" aria-hidden="true" />
        <div className="glass-demo-stack">
          <span className="glass-slab" style={{ backdropFilter: `blur(${settings.glassBlur}px)` }} />
          <span
            className="glass-slab is-raised"
            style={{ backdropFilter: `blur(${settings.glassBlur}px)` }}
          />
          <span
            className="glass-slab is-top"
            style={{ backdropFilter: `blur(${settings.glassBlur}px)` }}
          />
        </div>
      </div>

      <button
        type="button"
        className="action wide tweak-reset"
        onPointerMove={trackGlow}
        onPointerDown={spawnRipple}
        onClick={resetAppearance}
      >
        <Icon name="refresh" size={13} />
        Réinitialiser l’apparence
      </button>
    </section>
  )
}
