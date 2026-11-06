import {
  endpointHost,
  isLoopbackEndpoint,
  providerById,
  providerReady,
  providerState
} from '@shared/providers'
import type { Settings } from '@shared/types'
import { Icon } from '../Icon'

/**
 * Le moteur, sur une ligne, sous le titre du fil.
 *
 * Un chat n’a pas de panneau de réglages : il dit simplement qui répond, et
 * où. La localité se lit sur l’URL, pas sur le nom du fournisseur.
 */
export default function AgentEngine({
  settings,
  onConfigure
}: {
  settings: Settings
  onConfigure: () => void
}) {
  const definition = providerById(settings.agent.provider)
  const state = providerState(settings)
  const ready = providerReady(settings)
  const local = isLoopbackEndpoint(state.baseUrl)
  const model = state.model.trim() || definition.model
  const label = ready
    ? local
      ? `Local · ${model}`
      : `${definition.label} · ${model}`
    : 'Démo locale'
  const detail = ready
    ? local
      ? 'sur cet appareil'
      : (endpointHost(state.baseUrl) ?? 'distant')
    : 'rapport simulé'

  return (
    <button
      type="button"
      className="engine-line"
      onClick={onConfigure}
      title="Réglages › Modèles"
    >
      <Icon name={ready && !local ? 'cloud' : 'monitor'} size={11} />
      <span className="engine-name">{label}</span>
      <span className="engine-detail">{detail}</span>
    </button>
  )
}
