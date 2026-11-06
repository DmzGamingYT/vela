import { Icon } from '../Icon'
import { SectionTitle } from './spaceParts'

export type ManageAction = 'delete' | 'clear' | null

interface SpaceManageProps {
  space: { id: string; name: string }
  spaceCount: number
  action: ManageAction
  onAction(value: ManageAction): void
  onDuplicate(): void
  onRemove(): void
  onClear(): void
}

/** Section 6 : dupliquer, vider ou supprimer l’espace existant. */
export default function SpaceManage({
  space,
  spaceCount,
  action,
  onAction,
  onDuplicate,
  onRemove,
  onClear
}: SpaceManageProps) {
  return (
    <section className="space-section space-manage">
      <SectionTitle index={6} title="Gérer cet espace" />
      <div className="space-manage-actions">
        <button type="button" className="space-manage-btn" onClick={onDuplicate}>
          <Icon name="copy" size={13} />
          Dupliquer l’espace
        </button>
        <button type="button" className="space-manage-btn" onClick={() => onAction('clear')}>
          <Icon name="refresh" size={13} />
          Vider les données…
        </button>
        {spaceCount > 1 ? (
          <button
            type="button"
            className="space-manage-btn space-manage-danger"
            onClick={() => onAction('delete')}
          >
            <Icon name="trash" size={13} />
            Supprimer l’espace…
          </button>
        ) : null}
      </div>
      <p className="space-help">
        Dupliquer copie les réglages et les sites, jamais les cookies ni l’historique.
      </p>

      {action ? (
        <div className="space-confirm" role="alertdialog" aria-modal="false">
          <strong>
            {action === 'delete'
              ? `Supprimer « ${space.name} » ?`
              : `Vider les données de « ${space.name} » ?`}
          </strong>
          <p>
            {action === 'delete'
              ? 'Ses onglets, ses cookies et son historique seront perdus. Cette action est définitive et ne peut pas être annulée.'
              : 'Cookies, stockage, cache et historique de cet espace seront effacés. Ses réglages et sites épinglés restent. Action définitive.'}
          </p>
          <div className="space-confirm-actions">
            <button type="button" className="space-small-btn" onClick={() => onAction(null)}>
              Annuler
            </button>
            <button
              type="button"
              className="space-small-btn space-small-danger"
              onClick={action === 'delete' ? onRemove : onClear}
            >
              {action === 'delete' ? 'Supprimer définitivement' : 'Vider définitivement'}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
