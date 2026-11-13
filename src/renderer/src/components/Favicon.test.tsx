// @vitest-environment jsdom
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Favicon, { clearFaviconMemo } from './Favicon'

const ICON = 'data:image/png;base64,AA=='

afterEach(cleanup)

describe('lecture des favicons', () => {
  const peek = vi.fn(async () => null)
  const peekMany = vi.fn(async (hosts: string[]) =>
    Object.fromEntries(hosts.filter((host) => host === 'a.fr').map((host) => [host, ICON]))
  )
  const get = vi.fn(async () => null)

  beforeEach(() => {
    clearFaviconMemo()
    peek.mockClear()
    peekMany.mockClear()
    get.mockClear()
    vi.stubGlobal('vela', { favicons: { peek, peekMany, get } })
  })

  it('regroupe les domaines d’une liste en une seule lecture', async () => {
    const { container } = render(
      <>
        <Favicon url="https://a.fr/page" label="A" cacheOnly />
        <Favicon url="https://b.fr/page" label="B" cacheOnly />
      </>
    )

    await waitFor(() => expect(peekMany).toHaveBeenCalledTimes(1))
    expect(peekMany.mock.calls[0][0]).toEqual(['a.fr', 'b.fr'])
    // Aucun aller-retour par domaine, et rien ne part sur le réseau.
    expect(peek).not.toHaveBeenCalled()
    expect(get).not.toHaveBeenCalled()
    expect(container.querySelector('img')?.getAttribute('src')).toBe(ICON)
  })

  it('ne redemande pas un domaine déjà connu', async () => {
    const first = render(<Favicon url="https://a.fr/page" label="A" cacheOnly />)
    await waitFor(() => expect(peekMany).toHaveBeenCalledTimes(1))
    first.unmount()

    render(<Favicon url="https://a.fr/autre" label="A" cacheOnly />)
    await waitFor(() => expect(peekMany).toHaveBeenCalledTimes(1))
  })

  it('lit d’abord le disque, puis demande le réseau domaine par domaine', async () => {
    render(<Favicon url="https://c.fr/page" label="C" cacheOnly={false} />)
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1))
    // Le lot sert la lecture locale ; le réseau, lui, reste une demande par site.
    expect(peekMany).toHaveBeenCalledWith(['c.fr'], '')
    expect(get).toHaveBeenCalledWith('c.fr', '')
  })
})
