// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { TabView } from '@shared/types'
import TabRow from './TabRow'

afterEach(cleanup)

const tab = (favicon?: string): TabView => ({
  id: 'tab-1',
  spaceId: 'space-1',
  url: 'https://exemple.fr/page',
  title: 'Exemple',
  favicon,
  pinned: false,
  groupId: null,
  createdAt: 1,
  lastActiveAt: 1,
  loading: false,
  canGoBack: false,
  canGoForward: false,
  blocked: 0,
  agentSent: false,
  error: null,
  asleep: false,
  audible: false,
  muted: false,
  blockedHosts: []
})

const row = (favicon?: string) => (
  <TabRow tab={tab(favicon)} active={false} secondary={false} dragging={false} dropEdge={null} />
)

describe('ligne d’onglet', () => {
  it('retrouve l’image quand la page publie une nouvelle icône', () => {
    const { container, rerender } = render(row('https://exemple.fr/casse.ico'))
    const image = container.querySelector('img')
    expect(image?.getAttribute('src')).toBe('https://exemple.fr/casse.ico')

    // Icône illisible : la ligne retombe sur ses initiales.
    fireEvent.error(image as HTMLImageElement)
    expect(container.querySelector('img')).toBeNull()

    // La page charge ensuite une icône valide : elle doit reprendre sa place.
    rerender(row('https://exemple.fr/bonne.ico'))
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://exemple.fr/bonne.ico')
  })
})
