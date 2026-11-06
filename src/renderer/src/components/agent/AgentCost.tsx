import type { AgentActionEntry } from '@shared/agentLoop'
import { Icon } from '../Icon'

/**
 * Bloc 3 — ce que la réponse a coûté.
 *
 * Sources, actions, échecs et moteur sur une ligne : de quoi juger un rapport
 * sans ouvrir le journal, et savoir s’il vient de cet appareil.
 */
export default function AgentCost({
  sources,
  journal,
  engine,
  local,
  reviewed
}: {
  sources: number
  journal: AgentActionEntry[]
  engine: string
  local: boolean
  reviewed?: boolean
}) {
  const failed = journal.filter((entry) => !entry.ok).length
  return (
    <div className="cost" aria-label="Ce que la réponse a coûté">
      <span className="cost-item">
        <Icon name="notes" size={11} />
        {sources} source{sources > 1 ? 's' : ''}
      </span>
      {journal.length > 0 && (
        <span className="cost-item">
          {journal.length} action{journal.length > 1 ? 's' : ''}
        </span>
      )}
      {failed > 0 && (
        <span className="cost-item" data-bad="true">
          <Icon name="warning" size={10} />
          {failed} échec{failed > 1 ? 's' : ''}
        </span>
      )}
      <span className="cost-item">
        <Icon name={local ? 'lock' : 'cloud'} size={10} />
        {engine}
      </span>
      {reviewed && <span className="cost-item">relu</span>}
    </div>
  )
}
