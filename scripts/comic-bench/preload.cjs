const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('__vtTranslate', (texts, contexte) =>
  ipcRenderer.invoke('vt:translate', { texts, contexte })
)
contextBridge.exposeInMainWorld('__vtVision', (dataUrl) => ipcRenderer.invoke('vt:vision', { dataUrl }))
contextBridge.exposeInMainWorld('__vtSaveEdits', (key, value) => ipcRenderer.invoke('vt:save-edits', { key, value }))
contextBridge.exposeInMainWorld('__vtLoadEdits', (key) => ipcRenderer.invoke('vt:load-edits', { key }))
