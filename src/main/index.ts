import { app, BrowserWindow, ipcMain, Menu, net, protocol, session } from 'electron';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { EngineClient } from './engine-client';
import { getDemoInventory } from './fixtures';
import { resolveAsset, resolveHelperPath } from './paths';

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'leu',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
]);
app.setAppUserModelId('org.leu.desktop');
// Allows isolated test profiles and the usual Chromium user-data-dir override.
const userDataOverride = app.commandLine.getSwitchValue('user-data-dir');
if (userDataOverride) app.setPath('userData', path.resolve(userDataOverride));
let window: BrowserWindow | undefined;
let engine: EngineClient;
let quitting = false;

const productionOrigin = 'leu://app';
// A missed deadline restarts the helper, so allow slow or security-hooked registries to finish
// a bounded read of up to 4,096 registrations rather than failing the whole connection.
const INVENTORY_TIMEOUT_MS = 60_000;
const csp =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-src 'none'";

async function createWindow(): Promise<void> {
  const win = new BrowserWindow({
    width: 1380,
    height: 900,
    minWidth: 1050,
    minHeight: 700,
    title: 'LEU — Light Electron Uninstaller',
    icon: app.isPackaged
      ? path.join(process.resourcesPath, 'leu.ico')
      : path.join(app.getAppPath(), 'assets/branding/app-icons/leu.ico'),
    backgroundColor: '#f7f8fa',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  });
  window = win;
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    window = undefined;
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.on('will-attach-webview', (event) => event.preventDefault());
  await win.loadURL(app.isPackaged ? `${productionOrigin}/index.html` : MAIN_WINDOW_WEBPACK_ENTRY);
}

app
  .whenReady()
  .then(async () => {
    Menu.setApplicationMenu(null);
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) =>
      callback(false),
    );
    session.defaultSession.setPermissionCheckHandler(() => false);
    if (app.isPackaged) {
      // Enforce local-only browser requests even if renderer CSP is bypassed.
      session.defaultSession.webRequest.onBeforeRequest(({ url }, callback) => {
        const localProtocols = ['leu:', 'file:', 'data:', 'blob:', 'devtools:'];
        callback({ cancel: !localProtocols.includes(new URL(url).protocol) });
      });
      const assetRoot = path.dirname(path.dirname(fileURLToPath(MAIN_WINDOW_WEBPACK_ENTRY)));
      protocol.handle('leu', async (request) => {
        const url = new URL(request.url);
        const asset =
          url.host === 'app' && request.method === 'GET'
            ? resolveAsset(
                assetRoot,
                url.pathname === '/index.html' || url.pathname === '/'
                  ? '/main_window/index.html'
                  : url.pathname,
              )
            : undefined;
        if (!asset) return new Response('Not found', { status: 404 });
        try {
          const response = await net.fetch(pathToFileURL(asset).toString());
          const headers = new Headers(response.headers);
          headers.set('Content-Security-Policy', csp);
          headers.set('X-Content-Type-Options', 'nosniff');
          return new Response(response.body, { status: response.status, headers });
        } catch {
          return new Response('Not found', { status: 404 });
        }
      });
    }
    engine = new EngineClient(
      resolveHelperPath(app.isPackaged, app.getAppPath(), process.resourcesPath),
      [],
      5_000,
      (status) => {
        if (window && !window.isDestroyed())
          window.webContents.send('leu:engine-status-changed', status);
      },
    );
    const allowedOrigin = app.isPackaged
      ? productionOrigin
      : new URL(MAIN_WINDOW_WEBPACK_ENTRY).origin;
    const handlers: Record<string, () => unknown> = {
      'leu:app-info': () => ({
        version: app.getVersion(),
        electronVersion: process.versions.electron,
        platform: process.platform,
        packaged: app.isPackaged,
      }),
      'leu:engine-status': () => engine.getStatus(),
      'leu:engine-restart': () => engine.restart(),
      'leu:list-programs': () =>
        app.commandLine.hasSwitch('demo-inventory')
          ? getDemoInventory()
          : engine.request('inventory.list', {}, INVENTORY_TIMEOUT_MS).then((inventory) => ({
              ...inventory,
              source: 'windows' as const,
            })),
    };
    for (const [channel, handler] of Object.entries(handlers)) {
      ipcMain.handle(channel, (event, ...args: unknown[]) => {
        if (
          !window ||
          event.sender !== window.webContents ||
          !event.senderFrame ||
          event.senderFrame !== window.webContents.mainFrame ||
          event.senderFrame.origin !== allowedOrigin ||
          args.length !== 0
        ) {
          throw new Error('Request is not permitted.');
        }
        return handler();
      });
    }
    await createWindow();
    void engine.getStatus();
  })
  .catch((error: unknown) => {
    console.error('LEU startup failed:', error);
    app.exit(1);
  });

app.on('window-all-closed', () => app.quit());
app.on('before-quit', (event) => {
  if (quitting || !engine) return;
  event.preventDefault();
  quitting = true;
  void engine.stop().finally(() => app.quit());
});
