import { useEffect, useReducer, useRef, useState } from 'react';
import type { AppInfo } from '../contracts/bridge';
import { Icon } from './icons';
import { Logo } from './components/Logo';
import type { Connection } from './types';
import { InstalledApps } from './views/InstalledApps';
import { Activity } from './views/Activity';
import { Settings } from './views/Settings';
import { createInventoryState, inventoryReducer } from './inventory';
import { isListed } from './programs';

type View = 'apps' | 'activity' | 'settings';
export function App() {
  const [view, setView] = useState<View>('apps');
  const [inventoryState, dispatchInventory] = useReducer(
    inventoryReducer,
    Boolean(window.leu),
    createInventoryState,
  );
  const inventoryRequest = useRef(0);
  const { inventory, selectedId, loading, error: inventoryError, notice } = inventoryState;
  const programs = inventory?.programs ?? [];
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState('all');
  const [sort, setSort] = useState('name');
  const [engine, setEngine] = useState<Connection>({ state: 'connecting' });
  const [app, setApp] = useState<AppInfo>();
  const [loadError, setLoadError] = useState(() =>
    window.leu ? '' : 'The desktop bridge could not load. Restart LEU.',
  );

  useEffect(() => {
    if (!window.leu) {
      return;
    }
    const unsubscribe = window.leu.onEngineStatus(setEngine);
    let active = true;
    const request = ++inventoryRequest.current;
    window.leu
      .getAppInfo()
      .then(setApp)
      .catch(() => setLoadError('Application details could not load.'));
    window.leu
      .listPrograms()
      .then((inventory) => {
        if (active && request === inventoryRequest.current)
          dispatchInventory({ type: 'received', inventory });
      })
      .catch(() => {
        if (active && request === inventoryRequest.current) dispatchInventory({ type: 'failed' });
      });
    window.leu
      .getEngineStatus()
      .then(setEngine)
      .catch(() =>
        setEngine({
          state: 'error',
          code: 'START_FAILED',
          message: 'The helper connection could not be established.',
        }),
      );
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  async function reconnect() {
    setEngine({ state: 'connecting' });
    try {
      const status = await window.leu.restartEngine();
      setEngine(status);
      if (status.state === 'ready') await refresh();
    } catch {
      setEngine({
        state: 'error',
        code: 'START_FAILED',
        message: 'The helper connection could not be established.',
      });
    }
  }

  async function refresh() {
    const request = ++inventoryRequest.current;
    dispatchInventory({ type: 'request' });
    try {
      const inventory = await window.leu.listPrograms();
      if (request === inventoryRequest.current)
        dispatchInventory({ type: 'received', inventory, refreshed: true });
    } catch {
      if (request === inventoryRequest.current) dispatchInventory({ type: 'failed' });
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <Logo />
          <div>
            <strong>
              LEU<span className="brand-dot">.</span>
            </strong>
            <span>Light Electron Uninstaller</span>
          </div>
        </div>
        <div className="workspace-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {(
            [
              { id: 'apps', icon: 'apps', label: 'Installed apps' },
              { id: 'activity', icon: 'activity', label: 'Activity' },
              { id: 'settings', icon: 'settings', label: 'Settings' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              className={`nav-item ${view === item.id ? 'active' : ''}`}
              aria-current={view === item.id ? 'page' : undefined}
              onClick={() => setView(item.id)}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {item.id === 'apps' && (
                <span className="nav-count">
                  {programs.filter((program) => isListed(program)).length}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-card">
            <Icon name="shield" size={22} />
            <strong>Your computer. Your control.</strong>
            <p>
              Built in the open.
              <br />
              Designed to stay local.
            </p>
            <span>
              OPEN SOURCE <span>↗</span>
            </span>
          </div>
          <button className="engine-indicator" onClick={() => setView('settings')}>
            <span className={`status-dot ${engine.state}`} />
            <div>
              <strong>
                {engine.state === 'ready'
                  ? 'Engine connected'
                  : engine.state === 'error'
                    ? 'Engine unavailable'
                    : 'Connecting engine'}
              </strong>
              <span>
                {engine.state === 'ready'
                  ? `Rust helper v${engine.engineVersion}`
                  : 'View connection details'}
              </span>
            </div>
            <Icon name="chevron" size={14} />
          </button>
          <div className="sidebar-footer">
            <span>M1 · Inventory preview</span>
            <span>v{app?.version ?? '0.1.0'}</span>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <span className="breadcrumb">Workspace</span>
            <Icon name="chevron" size={12} />
            <span>
              {view === 'apps' ? 'Installed apps' : view === 'activity' ? 'Activity' : 'Settings'}
            </span>
          </div>
          <span className="preview-pill">
            <span /> DEVELOPMENT PREVIEW
          </span>
        </header>
        <div className="page-content">
          {loadError && (
            <div className="error-banner" role="alert">
              {loadError}
            </div>
          )}
          {view === 'apps' && (
            <InstalledApps
              programs={programs}
              inventory={inventory}
              loading={loading}
              error={inventoryError}
              selectedId={selectedId}
              setSelectedId={(id) => dispatchInventory({ type: 'select', id })}
              query={query}
              setQuery={setQuery}
              scope={scope}
              setScope={setScope}
              sort={sort}
              setSort={setSort}
              refresh={refresh}
            />
          )}

          {view === 'activity' && <Activity onExplore={() => setView('apps')} />}

          {view === 'settings' && <Settings app={app} engine={engine} onReconnect={reconnect} />}
          <div className="notice" role="status" aria-live="polite">
            {notice}
          </div>
        </div>
      </main>
    </div>
  );
}
