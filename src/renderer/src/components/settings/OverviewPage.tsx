import { sanitizeStartupUrl } from '@shared/navigation'
import { endpointHost, providerById, providerReady, providerState } from '@shared/providers'
import { presetById, type ResolvedMode, type ThemeId } from '@shared/theme'
import type { Settings } from '@shared/types'
import { engineLabel } from '@shared/url'
import { plural } from '../../lib/format'
import { useBrowser } from '../../store/browser'
import { Icon, type IconName } from '../Icon'

export type OverviewTarget = 'appearance' | 'navigation' | 'privacy' | 'agent'

const MODE_LABEL: Record<ResolvedMode, string> = { light: 'Clair', dark: 'Sombre' }

const DENSITY_LABEL: Record<Settings['density'], string> = {
  compact: 'compacte',
  normal: 'normale',
  airy: 'aérée'
}

const STARTUP_LABEL: Record<Settings['startupBehavior'], string> = {
  restore: 'Reprise',
  home: 'Accueil',
  url: 'Page précise'
}

function countLabel(count: number, singular: string, pluralForm: string): string {
  return count > 1 ? pluralForm : singular
}

function SummaryCard({
  icon,
  kicker,
  title,
  hint,
  status,
  action,
  tone = 'plain',
  onClick
}: {
  icon: IconName
  kicker: string
  title: string
  hint: string
  status: string
  action: string
  tone?: 'good' | 'plain'
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="overview-card"
      aria-label={`Ouvrir ${kicker} — ${title}`}
      onClick={onClick}
    >
      <span className="overview-card-top">
        <span className="overview-card-mark">
          <Icon name={icon} size={16} />
        </span>
        <span className="overview-card-kicker">{kicker}</span>
        <span className={tone === 'good' ? 'tag good' : 'tag'}>{status}</span>
      </span>
      <span className="overview-card-title">{title}</span>
      <span className="overview-card-hint">{hint}</span>
      <span className="overview-card-link">
        {action}
        <Icon name="arrow-right" size={12} />
      </span>
    </button>
  )
}

function DiscoverRow({
  icon,
  title,
  hint,
  onClick
}: {
  icon: IconName
  title: string
  hint: string
  onClick: () => void
}) {
  return (
    <button type="button" className="overview-discover-row" onClick={onClick}>
      <span className="overview-discover-mark">
        <Icon name={icon} size={14} />
      </span>
      <span className="overview-discover-copy">
        <strong>{title}</strong>
        <span>{hint}</span>
      </span>
      <Icon name="chevron-right" size={14} />
    </button>
  )
}

/**
 * Entrée des réglages : quatre états lisibles, puis des chemins directs vers
 * les sections qui demandent encore un choix. Les valeurs viennent toutes du
 * store réel, pour que la carte ne raconte pas autre chose que la page.
 */
export default function OverviewPage({
  settings,
  mode,
  previewThemeId,
  onOpenPage
}: {
  settings: Settings
  mode: ResolvedMode
  previewThemeId: ThemeId
  onOpenPage: (page: OverviewTarget) => void
}) {
  const view = useBrowser((state) => state.view)
  if (!view) return null

  const themeLabel = presetById(previewThemeId)?.label ?? 'Personnalisé'
  const accentLabel = themeLabel === 'Personnalisé' ? 'personnalisé' : themeLabel.toLowerCase()
  const appearanceStatus =
    settings.themeId === 'indigo' &&
    settings.customAccent.toUpperCase() === '#5B5BD6' &&
    settings.density === 'normal' &&
    settings.theme === 'system' &&
    !settings.hourTheme &&
    !settings.perSpaceThemes
      ? 'Défaut'
      : 'Personnalisé'
  const appearanceHint = `${mode === 'light' ? 'Mode clair' : 'Mode sombre'}, accent ${accentLabel}, densité ${DENSITY_LABEL[settings.density].toLowerCase()}.`

  const startup =
    settings.startupBehavior === 'url' && !sanitizeStartupUrl(settings.startupUrl)
      ? 'restore'
      : settings.startupBehavior
  const engine = engineLabel(
    settings.searchEngine,
    settings.customEngines.find((entry) => entry.id === settings.customEngineId)?.name
  )
  const navigationHint = `${
    startup === 'restore'
      ? 'Onglets restaurés'
      : startup === 'home'
        ? 'Accueil au lancement'
        : 'Page précise au lancement'
  } · ${plural(view.bookmarks.length, 'page gardée', 'pages gardées')}.`

  const protectedTabs = view.tabs.filter((entry) => {
    const owner = view.spaces.find((item) => item.id === entry.spaceId)
    return settings.blockTrackers && owner?.blockTrackers !== false && owner?.private !== true
  }).length
  const blockedDomains = new Set(
    view.tabs.flatMap((entry) => entry.blockedHosts.map((item) => item.host))
  ).size
  const privacyTitle = !settings.blockTrackers
    ? 'Protection désactivée'
    : settings.blockLevel === 'strict'
      ? 'Protection renforcée'
      : 'Traqueurs bloqués'
  const privacyHint = settings.blockTrackers
    ? `${plural(protectedTabs, 'onglet protégé', 'onglets protégés')} · ${plural(blockedDomains, 'site concerné', 'sites concernés')}`
    : 'Aucune requête n’est filtrée.'

  const definition = providerById(settings.agent.provider)
  const agentState = providerState(settings)
  const agentReady = providerReady(settings)
  const agentTitle = agentReady ? definition.label : 'Démo locale'
  const agentHint = agentReady
    ? `${agentState.model.trim() || definition.model} · ${endpointHost(agentState.baseUrl) ?? 'endpoint local'}`
    : `Aucune clé pour ${definition.label} : l’agent reste en démo.`

  const stats = [
    {
      value: view.bookmarks.length,
      label: countLabel(view.bookmarks.length, 'marque-page', 'marque-pages')
    },
    { value: view.history.length, label: 'historique' },
    { value: view.notes.length, label: countLabel(view.notes.length, 'note', 'notes') },
    { value: view.spaces.length, label: countLabel(view.spaces.length, 'espace', 'espaces') },
    {
      value: view.downloads.length,
      label: countLabel(view.downloads.length, 'téléchargement', 'téléchargements')
    }
  ]

  return (
    <div className="overview-page">
      <div className="overview-toolbar">
        <p>
          <span className="tag good">100 % local</span>
          Aucun compte, aucune synchronisation.
        </p>
        <button type="button" className="action primary" onClick={() => onOpenPage('appearance')}>
          <Icon name="palette" size={14} />
          Personnaliser
        </button>
      </div>

      <div className="overview-grid">
        <SummaryCard
          icon="palette"
          kicker="Apparence"
          title={`${MODE_LABEL[mode]} · ${themeLabel}`}
          hint={appearanceHint}
          status={appearanceStatus}
          action="Modifier"
          tone={appearanceStatus === 'Défaut' ? 'plain' : 'good'}
          onClick={() => onOpenPage('appearance')}
        />
        <SummaryCard
          icon="compass"
          kicker="Navigation"
          title={`${engine} · ${STARTUP_LABEL[startup]}`}
          hint={navigationHint}
          status="Local"
          action="Modifier"
          tone="good"
          onClick={() => onOpenPage('navigation')}
        />
        <SummaryCard
          icon="shield"
          kicker="Confidentialité"
          title={privacyTitle}
          hint={privacyHint}
          status={settings.blockTrackers ? 'Actif' : 'Inactif'}
          action="Voir le bilan"
          tone={settings.blockTrackers ? 'good' : 'plain'}
          onClick={() => onOpenPage('privacy')}
        />
        <SummaryCard
          icon="sparkles"
          kicker="Agent"
          title={agentTitle}
          hint={agentHint}
          status={agentReady ? 'Prêt' : 'Local'}
          action="Configurer"
          tone={agentReady ? 'good' : 'plain'}
          onClick={() => onOpenPage('agent')}
        />
      </div>

      <section className="setting-block">
        <div className="setting-head">
          <h2>À découvrir</h2>
          <p>Des chemins directs, sans parcourir toutes les sections.</p>
        </div>
        <div className="overview-discover-list">
          <DiscoverRow
            icon="palette"
            title="Accordez l’interface à votre rythme"
            hint="Densité, taille du texte, position de la barre latérale."
            onClick={() => onOpenPage('appearance')}
          />
          <DiscoverRow
            icon="compass"
            title="Reprenez vos onglets au lancement"
            hint="Choisissez ce que Vela ouvre au démarrage."
            onClick={() => onOpenPage('navigation')}
          />
          <DiscoverRow
            icon="shield"
            title="Vérifiez ce qui sort de l’appareil"
            hint="Chaque flux réseau, son déclencheur et ses données."
            onClick={() => onOpenPage('privacy')}
          />
        </div>
      </section>

      <section className="setting-block">
        <div className="setting-head">
          <h2>Ce qui vit sur cet appareil</h2>
          <p>Vos pages, vos notes et vos réglages restent dans le dossier de données de Vela.</p>
        </div>
        <div className="overview-stats">
          {stats.map((stat) => (
            <div className="overview-stat" key={stat.label}>
              <b>{stat.value}</b>
              <span>{stat.label}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
