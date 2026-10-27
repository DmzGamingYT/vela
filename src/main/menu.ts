import { app, Menu, shell, type MenuItemConstructorOptions } from 'electron'
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
        item('Ouvrir dans le mini navigateur', 'mini', send, 'Cmd+Shift+N'),
        item('Rouvrir l’onglet fermé', 'reopen-tab', send, 'Cmd+Shift+T'),
        { type: 'separator' },
        item('Fermer l’onglet', 'close-tab', send, 'Cmd+W'),
        item('Imprimer…', 'print', send, 'Cmd+P'),
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
      label: 'Affichage',
      submenu: [
        item('Barre de commande', 'command', send, 'Cmd+K'),
        item('Barre d’adresse', 'address', send, 'Cmd+L'),
        item('Rechercher dans la page', 'find', send, 'Cmd+F'),
        { type: 'separator' },
        item('Vue scindée', 'split', send, 'Cmd+Shift+D'),
        item('Notes', 'notes', send, 'Cmd+E'),
        item('Agent', 'agent', send, 'Cmd+J'),
        item('Atelier (Travail)', 'work', send, 'Cmd+Shift+A'),
        item('Brief du jour', 'brief', send, 'Cmd+Shift+B'),
        { type: 'separator' },
        item('Masquer la barre latérale', 'sidebar', send, 'Cmd+S'),
        { type: 'separator' },
        item('Agrandir le texte', 'zoom-in', send, 'Cmd+Plus'),
        item('Réduire le texte', 'zoom-out', send, 'Cmd+-'),
        item('Taille réelle du texte', 'zoom-reset', send, 'Cmd+0'),
        { type: 'separator' },
        item('Recharger', 'reload', send, 'Cmd+R'),
        { role: 'toggleDevTools', label: 'Outils de développement' },
        { role: 'togglefullscreen', label: 'Plein écran' }
      ]
    },
    {
      label: 'Historique',
      submenu: [
        item('Afficher l’historique', 'history', send, 'Cmd+Y'),
        { type: 'separator' },
        item('Page d’accueil', 'home', send, 'Cmd+Shift+H')
      ]
    },
    {
      label: 'Marque-pages',
      submenu: [
        item('Ajouter cette page', 'bookmark', send, 'Cmd+D'),
        item('Afficher les marque-pages', 'bookmarks', send, 'Cmd+Shift+O')
      ]
    },
    {
      label: 'Fenêtre',
      submenu: [
        { role: 'minimize', label: 'Réduire' },
        { role: 'zoom', label: 'Agrandir la fenêtre' },
        ...(isMac ? [{ type: 'separator' as const }, { role: 'front' as const, label: 'Tout ramener au premier plan' }] : [])
      ]
    },
    {
      role: 'help',
      label: 'Aide',
      submenu: [
        {
          label: 'Site de Vela',
          click: () => void shell.openExternal('https://site-cd854ef5da03437a8f42ade87147e33d.freebuff.page/')
        },
        {
          label: 'Versions et notes',
          click: () => void shell.openExternal('https://github.com/DmzGamingYT/vela/releases')
        },
        {
          label: 'Limites connues et signature',
          click: () =>
            void shell.openExternal('https://site-cd854ef5da03437a8f42ade87147e33d.freebuff.page/#faq')
        },
        {
          label: 'Signaler un problème',
          click: () => void shell.openExternal('https://github.com/DmzGamingYT/vela/issues')
        }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
