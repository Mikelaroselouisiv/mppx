const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mairieDesktop', {
  version: () => ({ app: 'mairie-desktop' }),
  apiRequest: (req) => ipcRenderer.invoke('mairie:apiRequest', req),
  putBinary: (req) => ipcRenderer.invoke('mairie:putBinary', req),
});

