import { describe, expect, it } from 'vitest'
import { PAGE_CHANNELS, canUseChannel, senderKindOf } from './ipcPolicy'

describe('classification des émetteurs IPC', () => {
  const ids = { shell: 1, mini: 2 }

  it('reconnaît la coque et la petite fenêtre', () => {
    expect(senderKindOf(1, ids)).toBe('shell')
    expect(senderKindOf(2, ids)).toBe('mini')
  })

  it('traite tout autre renderer comme une page', () => {
    expect(senderKindOf(7, ids)).toBe('page')
    expect(senderKindOf(null, ids)).toBe('unknown')
    expect(senderKindOf(undefined, ids)).toBe('unknown')
  })
})

describe('canaux autorisés', () => {
  it('donne tous les canaux à la coque', () => {
    for (const channel of ['settings:update', 'notes:save', 'tunnel:run', 'mini:open']) {
      expect(canUseChannel('shell', channel), channel).toBe(true)
    }
  })

  it('ne donne à la petite fenêtre que ses canaux', () => {
    expect(canUseChannel('mini', 'mini:navigate')).toBe(true)
    expect(canUseChannel('mini', 'mini:ready')).toBe(true)
    expect(canUseChannel('mini', 'settings:update')).toBe(false)
    expect(canUseChannel('mini', 'notes:save')).toBe(false)
  })

  it('limite une page aux canaux de son preload', () => {
    for (const channel of PAGE_CHANNELS) expect(canUseChannel('page', channel), channel).toBe(true)
    expect(canUseChannel('page', 'settings:update')).toBe(false)
    expect(canUseChannel('page', 'notes:save')).toBe(false)
    expect(canUseChannel('page', 'tunnel:run')).toBe(false)
    expect(canUseChannel('page', 'update:install')).toBe(false)
  })

  it('ne donne rien à un renderer inconnu', () => {
    expect(canUseChannel('unknown', 'settings:update')).toBe(false)
    expect(canUseChannel('unknown', 'mini:state')).toBe(false)
  })
})
