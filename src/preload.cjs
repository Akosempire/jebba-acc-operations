const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('jebba', {
  listEvents: () => ipcRenderer.invoke('events:list'),
  listMiscellaneous: () => ipcRenderer.invoke('miscellaneous:list'),
  dashboard: () => ipcRenderer.invoke('events:dashboard'),
  findDuplicates: p => ipcRenderer.invoke('events:duplicates', p),
  createEvent: p => ipcRenderer.invoke('events:create', p),
  createMiscellaneous: p => ipcRenderer.invoke('miscellaneous:create', p),
  addUpdate: p => ipcRenderer.invoke('events:update', p),
  backup: () => ipcRenderer.invoke('data:backup'),
  restore: () => ipcRenderer.invoke('data:restore'),
  info: () => ipcRenderer.invoke('app:info')
});
