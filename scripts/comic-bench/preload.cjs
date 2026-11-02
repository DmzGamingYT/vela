const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('__vtTranslate', (texts, contexte) =>
  ipcRenderer.invoke('vt:translate', { texts, contexte })
)
