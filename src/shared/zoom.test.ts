import { describe, expect, it } from 'vitest'
import { HOST_ZOOM_LIMIT, sanitizeZoomByHost, zoomHostOf, zoomPercentOfLevel } from './navigation'

describe('zoom mémorisé par domaine', () => {
  it('normalise l’hôte et garde un niveau valide', () => {
    expect(sanitizeZoomByHost({ 'Exemple.FR': 0.5 })).toEqual({ 'exemple.fr': 0.5 })
  })

  it('ignore un fichier abîmé sans jeter', () => {
    expect(sanitizeZoomByHost(null)).toEqual({})
    expect(sanitizeZoomByHost([])).toEqual({})
    expect(
      sanitizeZoomByHost({ a: '1', b: Number.NaN, c: Infinity, d: 9, e: -7, f: 0.123456 })
    ).toEqual({ f: 0.12 })
  })

  it('borne le nombre de domaines retenus', () => {
    const raw = Object.fromEntries(
      Array.from({ length: HOST_ZOOM_LIMIT + 20 }, (_, index) => [`h${index}.test`, 0])
    )
    expect(Object.keys(sanitizeZoomByHost(raw))).toHaveLength(HOST_ZOOM_LIMIT)
  })

  it('affiche le niveau en pourcentage', () => {
    expect(zoomPercentOfLevel(0)).toBe(100)
    expect(zoomPercentOfLevel(0.5)).toBe(110)
    expect(zoomPercentOfLevel(1)).toBe(120)
    expect(zoomPercentOfLevel(-1)).toBe(83)
  })

  it('ne retient que les pages web', () => {
    expect(zoomHostOf('https://Exemple.fr/a')).toBe('exemple.fr')
    expect(zoomHostOf('http://localhost:4187/x')).toBe('localhost:4187')
    expect(zoomHostOf('vela://home')).toBeNull()
    expect(zoomHostOf('about:blank')).toBeNull()
    expect(zoomHostOf('pas une url')).toBeNull()
  })
})
