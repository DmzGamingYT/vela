import { Icon } from '../Icon'

interface SidebarFootProps {
  query: string
  onQuery(value: string): void
  /** Onglets de l’espace en veille (repliés par la lune). */
  asleep: number
}

/**
 * Pied de la barre latérale.
 *
 * Il ne porte plus que la recherche d'onglets et le compte des mises en
 * veille. Les trois raccourcis (notes, agent, bibliothèque) sont montés dans
 * le rail de gauche, sous la bascule : la colonne garde une seule entrée,
 * et la liste d'onglets remonte d'autant.
 */
export default function SidebarFoot({ query, onQuery, asleep }: SidebarFootProps) {
  return (
    <div className="sidebar-foot">
      <label className="foot-search">
        <Icon name="search" size={14} />
        <input
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') onQuery('')
          }}
          placeholder="Filtrer les onglets"
          aria-label="Filtrer les onglets de ce profil"
          spellCheck={false}
          autoComplete="off"
        />
        {query && (
          <button
            type="button"
            className="foot-clear"
            aria-label="Effacer la recherche"
            onClick={() => onQuery('')}
          >
            <Icon name="close" size={13} />
          </button>
        )}
      </label>

      {asleep > 0 && (
        <p
          className="foot-note"
          title="En veille : la mémoire de ces onglets est libérée, la page se recharge à l’ouverture"
        >
          {asleep} onglet{asleep > 1 ? 's' : ''} en veille
        </p>
      )}
    </div>
  )
}
