import { app, Menu, shell, type MenuItemConstructorOptions } from 'electron'
import { ISSUES_URL, RELEASES_URL, SITE_FAQ_URL, SITE_URL } from '@shared/site'
import type { ShortcutAction } from '@shared/types'

/**
 * Menu natif minimal, décrit une fois pour les trois plateformes.
 *
 * Deux règles :
 *
 * - l'accélérateur s'écrit toujours `CmdOrCtrl+…` : macOS affiche ⌘, Windows
 *   et Linux affichent Ctrl+Maj+, sans que le libellé soit à maintenir deux
 *   fois ;
 * - il est déclaré mais **jamais enregistré** (`registerAccelerator: false`).
 *   La frappe est déjà interceptée dans `TabManager.handleInput`, qui la fait
 *   passer dans les pages comme dans la coque ; un accélérateur enregistré
 *   déclencherait la même action une seconde fois.
 */
export type MenuPlatform = 'darwin' | 'win32' | 'linux'

function item(
  label: string,
  action: ShortcutAction,
  send: (action: ShortcutAction) => void,
  accelerator?: string
): MenuItemConstructorOptions {
  return {
    label,
    ...(accelerator ? { accelerator, registerAccelerator: false } : {}),
    click: () => send(action)
  }
}

/** Gabarit du menu. Pur : la plateforme est un paramètre, pour être testable. */
export function buildMenuTemplate(
  platform: string,
  send: (action: ShortcutAction) => void
): MenuItemConstructorOptions[] {
  const isMac = platform === 'darwin'
  return [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const, label: 'À propos de Vela' },
              { type: 'separator' as const },
              item('Réglages…', 'settings', send, 'CmdOrCtrl+,'),
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
        item('Nouvel onglet', 'new-tab', send, 'CmdOrCtrl+T'),
        item('Ouvrir dans le mini navigateur', 'mini', send, 'CmdOrCtrl+Shift+N'),
        item('Rouvrir l’onglet fermé', 'reopen-tab', send, 'CmdOrCtrl+Shift+T'),
        { type: 'separator' },
        item('Fermer l’onglet', 'close-tab', send, 'CmdOrCtrl+W'),
        item('Imprimer…', 'print', send, 'CmdOrCtrl+P'),
        // Hors macOS, les réglages vivent dans Fichier : la barre de menus du
        // système ne porte pas de menu d'application.
        ...(isMac
          ? []
          : [
              { type: 'separator' as const },
              item('Réglages…', 'settings', send, 'CmdOrCtrl+,'),
              { role: 'quit' as const, label: 'Quitter' }
            ])
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
        item('Barre de commande', 'command', send, 'CmdOrCtrl+K'),
        item('Barre d’adresse', 'address', send, 'CmdOrCtrl+L'),
        item('Rechercher dans la page', 'find', send, 'CmdOrCtrl+F'),
        { type: 'separator' },
        item('Onglet suivant', 'next-tab', send, 'CmdOrCtrl+Shift+]'),
        item('Onglet précédent', 'prev-tab', send, 'CmdOrCtrl+Shift+['),
        { type: 'separator' },
        item('Vue scindée', 'split', send, 'CmdOrCtrl+Shift+D'),
        item('Notes', 'notes', send, 'CmdOrCtrl+E'),
        item('Agent', 'agent', send, 'CmdOrCtrl+J'),
        item('Atelier', 'work', send, 'CmdOrCtrl+Shift+A'),
        item('Brief', 'brief', send, 'CmdOrCtrl+Shift+B'),
        { type: 'separator' },
        item('Masquer la barre latérale', 'sidebar', send, 'CmdOrCtrl+S'),
        { type: 'separator' },
        item('Agrandir le texte', 'zoom-in', send, 'CmdOrCtrl+Plus'),
        item('Réduire le texte', 'zoom-out', send, 'CmdOrCtrl+-'),
        item('Taille réelle du texte', 'zoom-reset', send, 'CmdOrCtrl+0'),
        { type: 'separator' },
        item('Recharger', 'reload', send, 'CmdOrCtrl+R'),
        { role: 'toggleDevTools', label: 'Outils de développement' },
        { role: 'togglefullscreen', label: 'Plein écran' }
      ]
    },
    {
      label: 'Historique',
      submenu: [
        item('Afficher l’historique', 'history', send, 'CmdOrCtrl+Y'),
        { type: 'separator' },
        item('Page d’accueil', 'home', send, 'CmdOrCtrl+Shift+H')
      ]
    },
    {
      label: 'Marque-pages',
      submenu: [
        item('Ajouter cette page', 'bookmark', send, 'CmdOrCtrl+D'),
        item('Afficher les marque-pages', 'bookmarks', send, 'CmdOrCtrl+Shift+O')
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
          click: () => void shell.openExternal(SITE_URL)
        },
        {
          label: 'Versions et notes',
          click: () => void shell.openExternal(RELEASES_URL)
        },
        {
          label: 'Limites connues et signature',
          click: () => void shell.openExternal(SITE_FAQ_URL)
        },
        {
          label: 'Signaler un problème',
          click: () => void shell.openExternal(ISSUES_URL)
        }
      ]
    }
  ]
}

export function installMenu(send: (action: ShortcutAction) => void): void {
  Menu.setApplicationMenu(Menu.buildFromTemplate(buildMenuTemplate(process.platform, send)))
}
