import { useState } from 'react'
import { APP_SHORTCUTS } from '@shared/shortcuts'
import { shortcut, spokenShortcut } from '../../lib/format'
import { Icon } from '../Icon'

/** Comparaison sans accent ni casse : « precedente » trouve « Précédente ». */
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

/** Les touches aussi se cherchent en mots : « cmd », « maj », « option ». */
function spokenKeys(keys: string): string {
  return keys
    .replace(/⌘/g, ' commande cmd ')
    .replace(/⇧/g, ' maj shift ')
    .replace(/⌥/g, ' option alt ')
    .replace(/⌫/g, ' retour arriere ')
}

const SHORTCUT_GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: 'Navigation',
    items: [
      ['Barre de commande', shortcut('K')],
      ['Barre d’adresse', shortcut('L')],
      ['Précédente', shortcut('[')],
      ['Suivante', shortcut(']')],
      ['Recharger', shortcut('R')],
      ['Rechercher dans la page', shortcut('F')],
      ['Imprimer', shortcut('P')]
    ]
  },
  {
    title: 'Onglets et pages',
    items: [
      ['Nouvel onglet', shortcut('T')],
      ['Fermer l’onglet', shortcut('W')],
      ['Rouvrir l’onglet', shortcut('⇧T')],
      ['Onglets 1 à 9', `${shortcut('1')} … ${shortcut('9')}`],
      ['Vue scindée', shortcut('⇧D')],
      ['Garder cette page', shortcut('D')],
      ['Historique', shortcut('Y')],
      ['Marque-pages', shortcut('⇧O')],
      ['Accueil', shortcut('⇧H')]
    ]
  },
  {
    title: 'Surfaces',
    items: [
      ['Notes', shortcut(APP_SHORTCUTS.notes.key)],
      ['Agent', shortcut(APP_SHORTCUTS.agent.key)],
      ['Protection de la page', shortcut(APP_SHORTCUTS.shield.key)],
      ['Atelier', shortcut('⇧A')],
      ['Sessions', shortcut('⇧B')],
      ['Replier la barre latérale', shortcut('S')],
      ['Coup d’œil', shortcut('⌥N')],
      ['Réglages', shortcut(APP_SHORTCUTS.settings.key)]
    ]
  },
  {
    title: 'Lecture',
    items: [
      ['Zoom avant', shortcut('+')],
      ['Zoom arrière', shortcut('−')],
      ['Taille normale', shortcut('0')]
    ]
  }
]

export default function ShortcutsSection() {
  const [shortcutQuery, setShortcutQuery] = useState('')
  const search = normalize(shortcutQuery.trim())
  const query = (label: string, keys: string): string =>
    normalize(`${label} ${keys} ${spokenKeys(keys)}`)
  const groups = SHORTCUT_GROUPS.map((group) => ({
    title: group.title,
    items: group.items.filter(([label, keys]) => !search || query(label, keys).includes(search))
  })).filter((group) => group.items.length > 0)
  const total = groups.reduce((count, group) => count + group.items.length, 0)
  const all = SHORTCUT_GROUPS.reduce((count, group) => count + group.items.length, 0)

  return (
    <section className="setting-block">
      <div className="shortcut-toolbar" data-settings-anchor="system-shortcut-filter">
        <input
          className="shortcut-search"
          value={shortcutQuery}
          onChange={(event) => setShortcutQuery(event.target.value)}
          placeholder="Filtrer les raccourcis"
          aria-label="Filtrer les raccourcis"
          spellCheck={false}
          onKeyDown={(event) => {
            // Échap vide le filtre sans quitter les réglages.
            if (event.key !== 'Escape' || !shortcutQuery) return
            event.preventDefault()
            setShortcutQuery('')
          }}
        />
        <button
          type="button"
          className="action"
          onClick={() => setShortcutQuery('')}
          disabled={!search}
          title={search ? 'Effacer le filtre' : 'Aucun filtre actif'}
        >
          <Icon name="reload" size={13} />
          Réinitialiser
        </button>
      </div>
      <p className="shortcut-count" role="status">
        {search
          ? `${total} sur ${all} raccourcis`
          : `${all} raccourcis, en ${SHORTCUT_GROUPS.length} groupes`}
      </p>
      {total === 0 && <p className="shortcut-empty">Aucun raccourci ne correspond.</p>}
      {groups.map((group) => (
        <div className="shortcut-group" key={group.title}>
          <h3 className="shortcut-group-title">
            {group.title}
            <span className="shortcut-group-count">{group.items.length}</span>
          </h3>
          <div className="shortcut-table">
            {group.items.map(([label, keys]) => (
              <div className="shortcut-table-row" key={label}>
                <span>{label}</span>
                <kbd aria-label={spokenShortcut(keys)}>{keys}</kbd>
              </div>
            ))}
          </div>
        </div>
      ))}
      <p className="shortcut-note">
        Les combinaisons viennent du menu de l’application : cette version ne les remappe pas
        encore.
      </p>
    </section>
  )
}
