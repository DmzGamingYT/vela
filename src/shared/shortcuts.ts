/**
 * Raccourcis applicatifs communs au menu natif et à l’interface.
 *
 * `key` sert à l’affichage (`shortcut(key)` choisit ⌘ ou Ctrl) ; `accelerator`
 * est la forme attendue par Electron. Les deux restent dans la même entrée
 * pour qu’un changement de touche ne désaccorde pas le menu et le dock.
 */
export const APP_SHORTCUTS = {
  notes: { key: 'E', accelerator: 'CmdOrCtrl+E' },
  agent: { key: 'J', accelerator: 'CmdOrCtrl+J' },
  settings: { key: ',', accelerator: 'CmdOrCtrl+,' },
  /** Bouclier : le détail des requêtes arrêtées sur la page ouverte. */
  shield: { key: '⇧P', accelerator: 'CmdOrCtrl+Shift+P' }
} as const
