const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

// Set app name - must be done before app is ready
if (process.platform === 'darwin') {
  app.setName('Inkwell');
}

let mainWindow;
let currentFilePath = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    backgroundColor: '#fafafa'
  });

  mainWindow.loadFile('index.html');

  // Open DevTools in development
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

// Create application menu
function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow.webContents.send('menu-new')
        },
        {
          label: 'Open...',
          accelerator: 'CmdOrCtrl+O',
          click: () => openFile()
        },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow.webContents.send('menu-save')
        },
        {
          label: 'Save As...',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => mainWindow.webContents.send('menu-save-as')
        },
        { type: 'separator' },
        {
          label: 'Settings',
          accelerator: 'CmdOrCtrl+,',
          click: () => mainWindow.webContents.send('menu-settings')
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { role: 'close' }
      ]
    }
  ];

  if (process.platform === 'darwin') {
    template.unshift({
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: 'Settings',
          accelerator: 'CmdOrCtrl+,',
          click: () => mainWindow.webContents.send('menu-settings')
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

async function openFile() {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }
    ]
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0];
    const content = fs.readFileSync(filePath, 'utf-8');
    currentFilePath = filePath;
    mainWindow.webContents.send('file-opened', { filePath, content });
  }
}

// IPC handlers
ipcMain.handle('open-file', async () => {
  await openFile();
});

ipcMain.handle('save-file', async (event, { content, filePath }) => {
  let savePath = filePath || currentFilePath;

  if (!savePath) {
    const result = await dialog.showSaveDialog(mainWindow, {
      filters: [
        { name: 'Markdown', extensions: ['md'] }
      ]
    });

    if (result.canceled) {
      return { success: false };
    }
    savePath = result.filePath;
  }

  try {
    fs.writeFileSync(savePath, content, 'utf-8');
    currentFilePath = savePath;
    return { success: true, filePath: savePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('save-file-as', async (event, { content }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    filters: [
      { name: 'Markdown', extensions: ['md'] }
    ]
  });

  if (result.canceled) {
    return { success: false };
  }

  try {
    fs.writeFileSync(result.filePath, content, 'utf-8');
    currentFilePath = result.filePath;
    return { success: true, filePath: result.filePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-settings', async () => {
  const settingsPath = path.join(app.getPath('userData'), 'settings.json');
  try {
    if (fs.existsSync(settingsPath)) {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    }
  } catch (error) {
    console.error('Error reading settings:', error);
  }
  return { apiKey: '' };
});

ipcMain.handle('save-settings', async (event, settings) => {
  const settingsPath = path.join(app.getPath('userData'), 'settings.json');
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-last-file', async () => {
  const statePath = path.join(app.getPath('userData'), 'state.json');
  try {
    if (fs.existsSync(statePath)) {
      const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
      if (state.lastFilePath && fs.existsSync(state.lastFilePath)) {
        const content = fs.readFileSync(state.lastFilePath, 'utf-8');
        currentFilePath = state.lastFilePath;
        return { filePath: state.lastFilePath, content };
      }
    }
  } catch (error) {
    console.error('Error loading last file:', error);
  }
  return null;
});

ipcMain.handle('save-last-file', async (event, filePath) => {
  const statePath = path.join(app.getPath('userData'), 'state.json');
  try {
    fs.writeFileSync(statePath, JSON.stringify({ lastFilePath: filePath }, null, 2), 'utf-8');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Chat history - stored as .inkwell file alongside the document
// Format: { threads: [{ id, name, messages }], activeThreadId }
function getChatHistoryPath(filePath) {
  if (!filePath) return null;
  const dir = path.dirname(filePath);
  const base = path.basename(filePath, path.extname(filePath));
  return path.join(dir, `${base}.inkwell`);
}

ipcMain.handle('get-chat-history', async (event, filePath) => {
  const historyPath = getChatHistoryPath(filePath);
  if (!historyPath) return { threads: [], activeThreadId: null };
  try {
    if (fs.existsSync(historyPath)) {
      const data = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
      // Handle legacy format (just messages array)
      if (data.messages && !data.threads) {
        const legacyThread = {
          id: 'thread-1',
          name: 'Thread 1',
          messages: data.messages
        };
        return { threads: [legacyThread], activeThreadId: 'thread-1' };
      }
      return { threads: data.threads || [], activeThreadId: data.activeThreadId };
    }
  } catch (error) {
    console.error('Error reading chat history:', error);
  }
  return { threads: [], activeThreadId: null };
});

ipcMain.handle('save-chat-history', async (event, filePath, threadData) => {
  const historyPath = getChatHistoryPath(filePath);
  if (!historyPath) return { success: false };
  try {
    fs.writeFileSync(historyPath, JSON.stringify(threadData, null, 2), 'utf-8');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

app.whenReady().then(() => {
  // Set dock icon on macOS
  if (process.platform === 'darwin') {
    app.dock.setIcon(path.join(__dirname, 'assets', 'icon.png'));
  }

  createWindow();
  createMenu();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
