const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // File operations
  openFile: () => ipcRenderer.invoke('open-file'),
  saveFile: (data) => ipcRenderer.invoke('save-file', data),
  saveFileAs: (data) => ipcRenderer.invoke('save-file-as', data),

  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),

  // State persistence
  getLastFile: () => ipcRenderer.invoke('get-last-file'),
  saveLastFile: (filePath) => ipcRenderer.invoke('save-last-file', filePath),

  // Chat history
  getChatHistory: (filePath) => ipcRenderer.invoke('get-chat-history', filePath),
  saveChatHistory: (filePath, messages) => ipcRenderer.invoke('save-chat-history', filePath, messages),

  // Menu events
  onMenuNew: (callback) => ipcRenderer.on('menu-new', callback),
  onMenuSave: (callback) => ipcRenderer.on('menu-save', callback),
  onMenuSaveAs: (callback) => ipcRenderer.on('menu-save-as', callback),
  onMenuSettings: (callback) => ipcRenderer.on('menu-settings', callback),
  onFileOpened: (callback) => ipcRenderer.on('file-opened', (event, data) => callback(data))
});
