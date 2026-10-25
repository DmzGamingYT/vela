import { app, Menu, type MenuItemConstructorOptions } from 'electron'
import type { ShortcutAction } from '@shared/types'

const isMac = process.platform === 'darwin'

function item(
  label: string,
  action: ShortcutAction,
  send: (action: ShortcutAction) => void,
  accelerator?: string
): MenuItemConstructorOptions {
  return {
    label,
    ...(accelerator && isMac ? { accelerator, registerAccelerator: false } : {}),
    click: () => send(action)
  }
}

/**
 * Menu natif minimal. Les raccourcis réels sont interceptés dans
 * `TabManager.handleInput` : le menu ne fait que les afficher.
 */
export function installMenu(send: (action: ShortcutAction) => void): void {
  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const, label: 'À propos de Vela' },
              { type: 'separator' as const },
              item('Réglages…', 'settings', send, 'Cmd+,'),
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const, label: 'Masquer Vela' },
              { role: 'hideOthers' as const, label: 'Masquer les autres' },
              { role: 'unhide' as const, label: 'Tout afficher' },
              { type: 'separator' as const },
              { role: 'quit' as const, label: 'Quitter Vela' }
            ]
          }
        ]
      : []),
    {
      label: 'Fichier',
      submenu: [
        item('Nouvel onglet', 'new-tab', send, 'Cmd+T'),
        item('Rouvrir l’onglet fermé', 'reopen-tab', send, 'Cmd+Shift+T'),
        { type: 'separator' },
        item('Fermer l’onglet', 'close-tab', send, 'Cmd+W'),
        ...(isMac ? [] : [{ type: 'separator' as const }, { role: 'quit' as const, label: 'Quitter' }])
      ]
    },
    {
      label: 'Édition',
      submenu: [
        { role: 'undo', label: 'Annuler' },
        { role: 'redo', label: 'Rétablir' },
        { type: 'separator' },
        { role: 'cut', label: 'Couper' },
        { role: 'copy', label: 'Copier' },
        { role: 'paste', label: 'Coller' },
        { role: 'selectAll', label: 'Tout sélectionner' }
      ]
    },
    {
      label: 'Présentation',
      submenu: [
        item('Barre de commande', 'command', send, 'Cmd+K'),
        item('Barre d’adresse', 'address', send, 'Cmd+L'),
        { type: 'separator' },
        item('Vue scindée', 'split', send, 'Cmd+Shift+D'),
        item('Notes', 'notes', send, 'Cmd+E'),
        item('Agent', 'agent', send, 'Cmd+J'),
        item('Brief du jour', 'brief', send, 'Cmd+Shift+B'),
        { type: 'separator' },
        item('Masquer la barre latérale', 'sidebar', send, 'Cmd+S'),
        { type: 'separator' },
        item('Recharger', 'reload', send, 'Cmd+R'),
        { role: 'toggleDevTools', label: 'Outils de développement' },
        { role: 'togglefullscreen', label: 'Plein écran' }
      ]
    },
    {
      label: 'Fenêtre',
      submenu: [
        { role: 'minimize', label: 'Réduire' },
        { role: 'zoom', label: 'Agrandir' },
        ...(isMac ? [{ type: 'separator' as const }, { role: 'front' as const, label: 'Tout ramener au premier plan' }] : [])
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
