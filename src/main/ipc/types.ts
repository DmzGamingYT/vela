import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron'

/**
 * `ipcMain.handle`, passé par la politique IPC de `Browser.allowIpc`.
 *
 * Le gestionnaire reçoit l'événement en second argument : un canal peut alors
 * vérifier qui l'appelle, et n'agir que sur la page qui l'a demandé.
 */
export type Handle = (
  channel: string,
  handler: (payload: unknown, event?: IpcMainInvokeEvent) => unknown
) => void

/** `ipcMain.on`, passé par la politique IPC de `Browser.allowIpc`. */
export type On = (channel: string, handler: (event: IpcMainEvent, payload: unknown) => void) => void
