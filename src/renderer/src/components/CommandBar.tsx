import { useEffect, useMemo, useRef, useState } from 'react'
import { isHomeUrl, normalizeInput, prettyUrl } from '@shared/url'
import { shortcut } from '../lib/format'
import { useBrowser } from '../store/browser'
import { Icon, type IconName } from './Icon'

type Filter = 'all' | 'tabs' | 'notes' | 'tasks' | 'history' | 'downloads'

interface CommandItem {
  id: string
  group: 'Aller' | 'Agent' | 'Actions' | 'Onglets' | 'Espaces' | 'Historique' | 'Notes' | 'Tâches'
  label: string
  hint?: string
  icon: IconName
  run: () => void
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export default function CommandBar() {
  const view = useBrowser((state) => state.view)
  const setOverlay = useBrowser((state) => state.setOverlay)
  const navigate = useBrowser((state) => state.navigate)
  const selectTab = useBrowser((state) => state.selectTab)
  const closeTab = useBrowser((state) => state.closeTab)
  const reopen = useBrowser((state) => state.reopen)
  const splitToggle = useBrowser((state) => state.splitToggle)
  const newTab = useBrowser((state) => state.newTab)
  const openSpaceDialog = useBrowser((state) => state.openSpaceDialog)
  const activateSpace = useBrowser((state) => state.activateSpace)
  const openAgent = useBrowser((state) => state.openAgent)
  const toggleNotes = useBrowser((state) => state.toggleNotes)
  const toggleTask = useBrowser((state) => state.toggleTask)
  const reload = useBrowser((state) => state.reload)
  const updateSettings = useBrowser((state) => state.updateSettings)
  const workMode = useBrowser((state) => state.workMode)
  const setWorkMode = useBrowser((state) => state.setWorkMode)

  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [index, setIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const items = useMemo<CommandItem[]>(() => {
    if (!view) return []
    const search = normalize(query.trim())
    const active = view.tabs.find((tab) => tab.id === view.activeTabId)
    const withSpace = (id: string): string => view.spaces.find((item) => item.id === id)?.name ?? ''

    const run = (action: () => void): (() => void) => {
      return () => {
        setOverlay(null)
        setTimeout(action, 0)
      }
    }

    const all: CommandItem[] = []

    if (search) {
      all.push({
        id: 'open',
        group: 'Aller',
        label: `Ouvrir « ${query.trim()} »`,
        hint: normalizeInput(query.trim(), view.settings.searchEngine).kind === 'search' ? 'Recherche' : 'Adresse',
        icon: 'globe',
        run: run(() => navigate(view.activeTabId, query.trim()))
      })
      all.push({
        id: 'agent-query',
        group: 'Agent',
        label: `Demander à l’agent : ${query.trim()}`,
        hint: 'Brief, comparaison, synthèse',
        icon: 'sparkles',
        run: run(() => openAgent(query.trim()))
      })
    }

    const actions: CommandItem[] = [
      {
        id: 'action-new-tab',
        group: 'Actions',
        label: 'Nouvel onglet',
        hint: shortcut('T'),
        icon: 'plus',
        run: run(() => newTab())
      },
      {
        id: 'action-new-space',
        group: 'Actions',
        label: 'Nouvel espace',
        hint: 'Isoler un contexte',
        icon: 'circle',
        run: run(() => openSpaceDialog())
      },
      {
        id: 'action-split',
        group: 'Actions',
        label: 'Vue scindée',
        hint: shortcut('⇧D'),
        icon: 'split',
        run: run(() => splitToggle())
      },
      {
        id: 'action-notes',
        group: 'Actions',
        label: 'Ouvrir les notes',
        hint: shortcut('E'),
        icon: 'notes',
        run: run(() => toggleNotes(true))
      },
      {
        id: 'action-agent',
        group: 'Actions',
        label: 'Ouvrir l’agent',
        hint: shortcut('J'),
        icon: 'sparkles',
        run: run(() => openAgent())
      },
      {
        id: 'action-brief',
        group: 'Actions',
        label: 'Brief du jour',
        hint: shortcut('⇧B'),
        icon: 'calendar',
        run: run(() => setOverlay('brief'))
      },
      {
        id: 'action-reload',
        group: 'Actions',
        label: 'Recharger l’onglet',
        hint: shortcut('R'),
        icon: 'reload',
        run: run(() => active && reload(active.id))
      },
      {
        id: 'action-reopen',
        group: 'Actions',
        label: 'Rouvrir l’onglet fermé',
        hint: shortcut('⇧T'),
        icon: 'clock',
        run: run(() => reopen())
      },
      {
        id: 'action-sidebar',
        group: 'Actions',
        label: view.settings.sidebarCollapsed ? 'Afficher la barre latérale' : 'Replier la barre latérale',
        hint: shortcut('S'),
        icon: 'panel',
        run: run(() => updateSettings({ sidebarCollapsed: !view.settings.sidebarCollapsed }))
      },
      {
        id: 'action-settings',
        group: 'Actions',
        label: 'Réglages',
        hint: shortcut(','),
        icon: 'settings',
        run: run(() => setOverlay('settings'))
      },
      {
        id: 'action-work',
        group: 'Actions',
        label: workMode === 'work' ? 'Revenir à Browse' : 'Passer en Work',
        hint: shortcut('⇧A'),
        icon: 'sparkles',
        run: run(() => setWorkMode(workMode === 'work' ? 'browse' : 'work'))
      },
      {
        id: 'action-processes',
        group: 'Actions',
        label: 'Gestionnaire de processus',
        icon: 'panel',
        run: run(() => setOverlay('processes'))
      },
      {
        id: 'action-downloads',
        group: 'Actions',
        label: 'Téléchargements',
        icon: 'download',
        run: run(() => setOverlay('downloads'))
      }
    ]
    if (active) {
      actions.splice(6, 0, {
        id: 'action-close',
        group: 'Actions',
        label: 'Fermer l’onglet',
        hint: shortcut('W'),
        icon: 'close',
        run: run(() => closeTab(active.id))
      })
    }

    const tabs: CommandItem[] = view.tabs
      .filter((tab) => !isHomeUrl(tab.url))
      .map((tab) => ({
        id: `tab-${tab.id}`,
        group: 'Onglets',
        label: tab.title,
        hint: `${withSpace(tab.spaceId)} · ${prettyUrl(tab.url)}`,
        icon: 'globe',
        run: run(() => selectTab(tab.id))
      }))

    const spaces: CommandItem[] = view.spaces.map((item) => ({
      id: `space-${item.id}`,
      group: 'Espaces',
      label: item.name,
      hint: item.id === view.activeSpaceId ? 'Espace actif' : 'Changer d’espace',
      icon: 'circle',
      run: run(() => activateSpace(item.id))
    }))

    const history: CommandItem[] = view.history
      .filter((entry) => !isHomeUrl(entry.url))
      .map((entry) => ({
        id: `history-${entry.id}`,
        group: 'Historique',
        label: entry.title,
        hint: prettyUrl(entry.url),
        icon: 'clock',
        run: run(() => navigate(view.activeTabId, entry.url))
      }))

    const notes: CommandItem[] = view.notes.map((note) => ({
      id: `note-${note.id}`,
      group: 'Notes',
      label: note.title || 'Sans titre',
      hint: note.preview.slice(0, 60),
      icon: 'notes',
      run: run(() => toggleNotes(true))
    }))

    const tasks: CommandItem[] = view.tasks.filter((task) => !task.done).map((task) => ({
      id: `task-${task.id}`,
      group: 'Tâches',
      label: task.title,
      hint: 'Basculer faite / non faite',
      icon: 'check',
      run: run(() => toggleTask(task.id))
    }))

    const downloads: CommandItem[] = (view.downloads ?? []).map((d) => ({
      id: `dl-${d.id}`,
      group: 'Aller',
      label: d.name,
      hint: d.state === 'done' ? 'Ouvrir le dossier' : 'Téléchargement en cours',
      icon: 'external',
      run: run(() => { setOverlay('downloads') })
    }))

    const byFilter = (item: CommandItem): boolean => {
      if (filter === 'tabs') return item.group === 'Onglets'
      if (filter === 'notes') return item.group === 'Notes'
      if (filter === 'tasks') return item.group === 'Tâches'
      if (filter === 'history') return item.group === 'Historique'
      if (filter === 'downloads') return item.group === 'Aller' && /Télécharg|Ouvrir le dossier/.test(item.hint ?? '')
      return true
    }
    const source = [...all, ...actions, ...tabs, ...spaces, ...history, ...notes, ...tasks, ...downloads].filter(byFilter)
    if (!search) {
      return [...actions, ...tabs, ...spaces, ...notes.slice(0, 3), ...tasks.slice(0, 3)].filter(byFilter).slice(0, 24)
    }
    return source
      .filter((item) => normalize(`${item.label} ${item.hint ?? ''} ${item.group}`).includes(search))
      .slice(0, 24)
  }, [
    view,
    query,
    filter,
    setOverlay,
    navigate,
    selectTab,
    closeTab,
    reopen,
    splitToggle,
    newTab,
    openSpaceDialog,
    activateSpace,
    openAgent,
    toggleNotes,
    toggleTask,
    reload,
    updateSettings,
    workMode,
    setWorkMode
  ])

  useEffect(() => {
    setIndex(0)
  }, [query, filter])

  useEffect(() => {
    setIndex((current) => Math.min(current, Math.max(0, items.length - 1)))
  }, [items.length])

  const groups = useMemo(() => {
    const result: { name: string; items: CommandItem[] }[] = []
    for (const item of items) {
      const last = result[result.length - 1]
      if (last && last.name === item.group) last.items.push(item)
      else result.push({ name: item.group, items: [item] })
    }
    return result
  }, [items])

  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>('[data-active="true"]')
    node?.scrollIntoView({ block: 'nearest' })
  }, [index])

  if (!view) return null

  const activeItem = items[index]
  const space = view.spaces.find((item) => item.id === view.activeSpaceId)

  const trigger = (item: CommandItem | undefined): void => {
    if (!item) return
    item.run()
  }

  let cursor = 0
  const offsets = groups.map((group) => {
    const offset = cursor
    cursor += group.items.length
    return offset
  })

  return (
    <div className="overlay command-overlay" onMouseDown={() => setOverlay(null)}>
      <div className="command command-pop" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-label="Barre de commande">
        <div className="command-input-row">
          <Icon name="search" size={18} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Onglets, adresse, actions, agent…"
            spellCheck={false}
            aria-label="Rechercher"
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setIndex((current) => (items.length ? (current + 1) % items.length : 0))
              } else if (event.key === 'ArrowUp') {
                event.preventDefault()
                setIndex((current) => (items.length ? (current - 1 + items.length) % items.length : 0))
              } else if (event.key === 'Enter') {
                event.preventDefault()
                trigger(items[index])
              } else if (event.key === 'Escape') {
                event.preventDefault()
                setOverlay(null)
              }
            }}
          />
          <span className="command-space">
            <span className="space-dot" style={{ background: space?.color }} />
            {space?.name}
          </span>
        </div>

        <div className="command-list" ref={listRef}>
          {items.length === 0 && <p className="command-empty">Rien ne correspond. Essayez une adresse ou une action.</p>}
          {groups.map((group, groupIndex) => (
            <div className="command-group" key={group.name}>
              <div className="command-group-title">{group.name}</div>
              {group.items.map((item, itemIndex) => {
                const globalIndex = offsets[groupIndex] + itemIndex
                const selected = globalIndex === index
                return (
                  <button
                    type="button"
                    key={item.id}
                    className="command-item"
                    data-active={selected}
                    onMouseEnter={() => setIndex(globalIndex)}
                    onClick={() => trigger(item)}
                  >
                    <span className="command-icon">
                      <Icon name={item.icon} size={15} />
                    </span>
                    <span className="command-label">{item.label}</span>
                    {item.hint && <span className="command-hint">{item.hint}</span>}
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        <div className="command-filters" role="tablist" aria-label="Filtres">
          {([['all', 'Tout'], ['tabs', 'Onglets'], ['notes', 'Notes'], ['tasks', 'Tâches'], ['history', 'Historique'], ['downloads', 'DL']] as [Filter, string][]).map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={filter === id} className="command-filter" data-active={filter === id} onClick={() => setFilter(id)}>{label}</button>
          ))}
        </div>

        <footer className="command-foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> naviguer
          </span>
          <span>
            <kbd>↵</kbd> {activeItem ? activeItem.group.toLowerCase() : 'ouvrir'}
          </span>
          <span>
            <kbd>esc</kbd> fermer
          </span>
          <span className="command-brand">Vela</span>
        </footer>
      </div>
    </div>
  )
}
