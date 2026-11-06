import type { IpcMainEvent } from 'electron'

/** `ipcMain.handle`, passé par la politique IPC de `Browser.allowIpc`. */
export type Handle = (channel: string, handler: (payload: unknown) => unknown) => void

/** `ipcMain.on`, passé par la politique IPC de `Browser.allowIpc`. */
export type On = (
  channel: string,
  handler: (event: IpcMainEvent, payload: unknown) => void
) => void
