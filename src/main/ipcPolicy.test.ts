import { describe, expect, it } from 'vitest'
import { PAGE_CHANNELS, canUseChannel, senderKindOf } from './ipcPolicy'

describe('classification des émetteurs IPC', () => {
  const ids = { shell: 1 }

  it('reconnaît la coque', () => {
    expect(senderKindOf(1, ids)).toBe('shell')
  })

  it('traite tout autre renderer comme une page', () => {
    expect(senderKindOf(7, ids)).toBe('page')
    expect(senderKindOf(null, ids)).toBe('unknown')
    expect(senderKindOf(undefined, ids)).toBe('unknown')
  })
})

describe('canaux autorisés', () => {
  it('donne tous les canaux à la coque', () => {
    for (const channel of ['settings:update', 'notes:save', 'tunnel:run', 'peek:open']) {
      expect(canUseChannel('shell', channel), channel).toBe(true)
    }
  })

  it('limite une page aux canaux de son preload', () => {
    for (const channel of PAGE_CHANNELS) expect(canUseChannel('page', channel), channel).toBe(true)
    expect(canUseChannel('page', 'settings:update')).toBe(false)
    expect(canUseChannel('page', 'notes:save')).toBe(false)
    expect(canUseChannel('page', 'tunnel:run')).toBe(false)
    expect(canUseChannel('page', 'update:install')).toBe(false)
  })

  it('ne laisse pas une page ouvrir le coup d’œil', () => {
    for (const channel of ['peek:open', 'peek:state', 'peek:layout']) {
      expect(canUseChannel('page', channel), channel).toBe(false)
      expect(canUseChannel('shell', channel), channel).toBe(true)
    }
  })

  it('laisse le pilotage de la traduction BD à la seule coque', () => {
    // Une page peut emprunter l'image et la traduction ; lancer ou arrêter le
    // script sur un onglet reste une commande du châssis.
    for (const channel of ['comic:run', 'comic:clear']) {
      expect(canUseChannel('page', channel), channel).toBe(false)
      expect(canUseChannel('shell', channel), channel).toBe(true)
    }
    for (const channel of ['comic:vision', 'comic:edits', 'comic:load-edits']) {
      expect(canUseChannel('page', channel), channel).toBe(true)
    }
  })

  it('ne donne rien à un renderer inconnu', () => {
    expect(canUseChannel('unknown', 'settings:update')).toBe(false)
    expect(canUseChannel('unknown', 'peek:state')).toBe(false)
  })
})
