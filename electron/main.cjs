const { app, BrowserWindow, shell, session, ipcMain } = require('electron');
const path = require('path');

const devServerUrl = process.env.VITE_DEV_SERVER_URL;
const isDev = Boolean(devServerUrl);

function buildCspHeader() {
  if (isDev) {
    // Vite dev server uses eval for source maps/HMR in many setups.
    return [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline' http://localhost:5173",
      "style-src 'self' 'unsafe-inline' http://localhost:5173",
      "img-src 'self' data: blob: http: https:",
      "font-src 'self' data:",
      "connect-src 'self' http://localhost:5173 ws://localhost:5173 http: https:",
      "base-uri 'none'",
      "frame-ancestors 'none'",
    ].join('; ');
  }

  // Packaged / production: stricter defaults.
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https:",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
  ].join('; ');
}

function installCsp() {
  const csp = buildCspHeader();
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = details.responseHeaders || {};
    headers['Content-Security-Policy'] = [csp];
    callback({ responseHeaders: headers });
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 980,
    minHeight: 650,
    backgroundColor: '#f3f0e6',
    // In production, public/ is not shipped; dist/ is.
    icon: path.join(__dirname, '..', 'dist', 'favicon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    win.loadURL(devServerUrl);
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  installCsp();

  ipcMain.handle('mairie:apiRequest', async (_evt, req) => {
    const url = typeof req?.url === 'string' ? req.url : '';
    const method = typeof req?.method === 'string' ? req.method : 'GET';
    const headers = req?.headers && typeof req.headers === 'object' ? req.headers : {};
    const body = typeof req?.body === 'string' ? req.body : undefined;

    if (!/^https?:\/\//i.test(url)) {
      return { ok: false, status: 0, text: 'Invalid URL' };
    }

    try {
      const res = await fetch(url, {
        method,
        headers,
        body,
      });
      const text = await res.text();
      return { ok: res.ok, status: res.status, text };
    } catch (e) {
      return { ok: false, status: 0, text: String(e) };
    }
  });

  // Binary upload helper (S3 presigned PUT, etc.) — avoids CORS issues in renderer.
  ipcMain.handle('mairie:putBinary', async (_evt, req) => {
    const url = typeof req?.url === 'string' ? req.url : '';
    const headers = req?.headers && typeof req.headers === 'object' ? req.headers : {};
    const bytes = req?.bytes;

    if (!/^https?:\/\//i.test(url)) {
      return { ok: false, status: 0, text: 'Invalid URL' };
    }

    let body;
    try {
      if (bytes && bytes instanceof Uint8Array) {
        body = Buffer.from(bytes);
      } else if (bytes && bytes.buffer instanceof ArrayBuffer) {
        body = Buffer.from(bytes);
      } else {
        return { ok: false, status: 0, text: 'Invalid bytes' };
      }
    } catch (e) {
      return { ok: false, status: 0, text: `Invalid bytes: ${e instanceof Error ? e.message : String(e)}` };
    }

    try {
      const res = await fetch(url, {
        method: 'PUT',
        headers,
        body,
      });
      const text = await res.text().catch(() => '');
      return { ok: res.ok, status: res.status, text };
    } catch (e) {
      return { ok: false, status: 0, text: String(e) };
    }
  });

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

