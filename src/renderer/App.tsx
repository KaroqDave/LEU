import { useEffect, useState } from 'react';
import type { AppInfo, EngineStatus, Program } from '../contracts/bridge';
import { Icon, Logo } from './icons';
import { filterPrograms, formatSize } from './programs';

type View = 'apps' | 'activity' | 'settings';
type Connection = EngineStatus | { state: 'connecting' };

export function App() {
  const [view, setView] = useState<View>('apps');
  const [programs, setPrograms] = useState<Program[]>([]);
  const [selectedId, setSelectedId] = useState('demo-code');
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState('all');
  const [sort, setSort] = useState('name');
  const [engine, setEngine] = useState<Connection>({ state: 'connecting' });
  const [app, setApp] = useState<AppInfo>();
  const [notice, setNotice] = useState('');
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!window.leu) {
      setLoadError('The desktop bridge could not load. Restart LEU.');
      return;
    }
    const unsubscribe = window.leu.onEngineStatus(setEngine);
    window.leu
      .getAppInfo()
      .then(setApp)
      .catch(() => setLoadError('Application details could not load.'));
    window.leu
      .listPrograms()
      .then((inventory) => setPrograms(inventory.programs))
      .catch(() => setLoadError('Sample programs could not load.'));
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
    return unsubscribe;
  }, []);

  const visible = filterPrograms(programs, query, scope, sort);
  const selected = visible.find((program) => program.id === selectedId) ?? visible[0];
  const totalSize = programs.reduce(
    (total, program) => total + (program.reportedSizeBytes ?? 0),
    0,
  );

  async function reconnect() {
    setEngine({ state: 'connecting' });
    try {
      setEngine(await window.leu.restartEngine());
    } catch {
      setEngine({
        state: 'error',
        code: 'START_FAILED',
        message: 'The helper connection could not be established.',
      });
    }
  }

  async function refresh() {
    try {
      const inventory = await window.leu.listPrograms();
      setPrograms(inventory.programs);
      setNotice('Sample list refreshed. Live Windows discovery arrives in M1.');
    } catch {
      setLoadError('The sample list could not be refreshed.');
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
              {item.id === 'apps' && <span className="nav-count">{programs.length}</span>}
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
            <span>M0 · Foundation</span>
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
            <>
              <section className="page-heading">
                <div>
                  <div className="eyebrow">A LITTLE LESS CLUTTER</div>
                  <h1>
                    Installed apps<span>.</span>
                  </h1>
                  <p>A clear view of what’s on your computer.</p>
                </div>
                <button className="button secondary" onClick={() => void refresh()}>
                  <Icon name="refresh" size={16} />
                  Refresh list
                </button>
              </section>
              <div className="demo-banner">
                <Icon name="info" size={18} />
                <div>
                  <strong>You’re exploring sample data.</strong> These programs are examples. Live
                  Windows discovery is the next milestone.
                </div>
                <span>PREVIEW</span>
              </div>
              <section className="stats" aria-label="Sample inventory summary">
                <Stat
                  icon="apps"
                  label="Applications"
                  value={String(programs.length).padStart(2, '0')}
                  detail="In this sample workspace"
                />
                <Stat
                  icon="drive"
                  label="Reported size"
                  value={formatSize(totalSize)}
                  detail="Installer estimates · 1 size unknown"
                />
                <Stat
                  icon="user"
                  label="Installed for you"
                  value={String(
                    programs.filter((program) => program.scope === 'user').length,
                  ).padStart(2, '0')}
                  detail="Current user applications"
                />
              </section>
              <div className="inventory-layout">
                <section className="program-panel" aria-label="Sample installed programs">
                  <div className="panel-heading">
                    <h2>
                      Your applications <span>{programs.length}</span>
                    </h2>
                    <span className="muted tiny">Sample inventory</span>
                  </div>
                  <div className="toolbar">
                    <label className="search-field">
                      <Icon name="search" size={18} />
                      <input
                        aria-label="Search applications"
                        placeholder="Search apps or publishers…"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                      />
                    </label>
                    <label className="sort-label">
                      <span>Sort by</span>
                      <select
                        aria-label="Sort applications"
                        value={sort}
                        onChange={(event) => setSort(event.target.value)}
                      >
                        <option value="name">Name</option>
                        <option value="size">Size</option>
                      </select>
                    </label>
                  </div>
                  <div className="scope-tabs" aria-label="Installation scope">
                    {[
                      { value: 'all', label: 'All apps' },
                      { value: 'user', label: 'For you' },
                      { value: 'machine', label: 'System wide' },
                    ].map((filter) => (
                      <button
                        key={filter.value}
                        aria-pressed={scope === filter.value}
                        className={scope === filter.value ? 'selected' : ''}
                        onClick={() => setScope(filter.value)}
                      >
                        {filter.label}
                      </button>
                    ))}
                  </div>
                  <table className="program-table">
                    <thead>
                      <tr>
                        <th>APPLICATION</th>
                        <th>SIZE</th>
                        <th>SCOPE</th>
                        <th aria-label="Details" />
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((program) => (
                        <tr
                          key={program.id}
                          className={selected?.id === program.id ? 'selected-row' : ''}
                        >
                          <td>
                            <button
                              className="program-choice"
                              aria-pressed={selected?.id === program.id}
                              onClick={() => setSelectedId(program.id)}
                            >
                              <AppIcon program={program} />
                              <span>
                                <strong>{program.name}</strong>
                                <small>{program.publisher}</small>
                              </span>
                            </button>
                          </td>
                          <td className={program.reportedSizeBytes === null ? 'muted' : ''}>
                            {formatSize(program.reportedSizeBytes)}
                          </td>
                          <td>
                            <span className="scope-badge">
                              {program.scope === 'user' ? 'For you' : 'System'}
                            </span>
                          </td>
                          <td>
                            <Icon name="chevron" size={14} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {visible.length === 0 && (
                    <div className="empty-search">
                      <Icon name="search" size={30} />
                      <h3>No applications found</h3>
                      <p>Try a different search or installation scope.</p>
                      <button
                        className="text-button"
                        onClick={() => {
                          setQuery('');
                          setScope('all');
                        }}
                      >
                        Clear filters
                      </button>
                    </div>
                  )}
                  <div className="table-footer">
                    <span>
                      Showing {visible.length} of {programs.length} applications
                    </span>
                    <span>
                      <span className="mini-dot" /> Sample data
                    </span>
                  </div>
                </section>
                <aside className="details-panel" aria-label="Application details">
                  {selected ? (
                    <>
                      <div className="details-label">
                        APPLICATION DETAILS
                        <Icon name="info" size={16} />
                      </div>
                      <div className="details-identity">
                        <AppIcon program={selected} large />
                        <h2>{selected.name}</h2>
                        <p>{selected.publisher}</p>
                        <span className="version-pill">Version {selected.version}</span>
                      </div>
                      <dl className="detail-list">
                        <div>
                          <dt>Reported size</dt>
                          <dd>{formatSize(selected.reportedSizeBytes)}</dd>
                        </div>
                        <div>
                          <dt>Installed on</dt>
                          <dd>
                            {selected.installedOn
                              ? new Intl.DateTimeFormat('en', {
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric',
                                  timeZone: 'UTC',
                                }).format(new Date(selected.installedOn))
                              : 'Unknown'}
                          </dd>
                        </div>
                        <div>
                          <dt>Installed for</dt>
                          <dd>{selected.scope === 'user' ? 'Current user' : 'All users'}</dd>
                        </div>
                        <div>
                          <dt>Source</dt>
                          <dd className="accent-text">Sample record</dd>
                        </div>
                      </dl>
                      <div className="location">
                        <span>
                          <Icon name="folder" size={16} />
                          INSTALL LOCATION
                        </span>
                        <code>{selected.installLocation}</code>
                      </div>
                      <div className="uninstall-area">
                        <button
                          className="button primary"
                          disabled
                          aria-describedby="uninstall-note"
                        >
                          Uninstall application
                          <Icon name="arrow" size={16} />
                        </button>
                        <p id="uninstall-note">
                          Uninstallation becomes available in M2.
                          <br />
                          This preview makes no system changes.
                        </p>
                      </div>
                      <div className="detail-note">
                        <Icon name="shield" size={18} />
                        <p>Every cleanup action will be yours to review.</p>
                      </div>
                    </>
                  ) : (
                    <div className="empty-search">
                      <Icon name="box" size={30} />
                      <p>Select an application to view its details.</p>
                    </div>
                  )}
                </aside>
              </div>
              <div className="page-footnote">
                <Icon name="shield" size={14} /> A lighter computer starts with a clearer picture.
              </div>
            </>
          )}

          {view === 'activity' && (
            <>
              <PageHeading
                eyebrow="EVERY ACTION ACCOUNTED FOR"
                title="Activity"
                description="A history you can understand and revisit."
              />
              <section className="empty-panel">
                <div className="empty-symbol">
                  <Icon name="activity" size={30} />
                </div>
                <h2>A fresh start.</h2>
                <p>
                  There are no operations yet. When uninstall and cleanup
                  <br />
                  are available, their results will appear here.
                </p>
                <button className="button secondary" onClick={() => setView('apps')}>
                  Explore your applications
                  <Icon name="arrow" size={16} />
                </button>
              </section>
            </>
          )}

          {view === 'settings' && (
            <>
              <PageHeading
                eyebrow="MAKE YOURSELF AT HOME"
                title="Settings"
                description="The essentials behind your workspace."
              />
              <section className="settings-panel">
                <div className="panel-heading">
                  <h2>Windows engine</h2>
                  <span className={`connection-badge ${engine.state}`}>
                    {engine.state === 'ready'
                      ? 'Connected'
                      : engine.state === 'connecting'
                        ? 'Connecting'
                        : 'Unavailable'}
                  </span>
                </div>
                <p>
                  The local Rust helper handles Windows integration through a restricted connection.
                </p>
                {engine.state === 'ready' ? (
                  <dl className="settings-list">
                    <div>
                      <dt>Engine version</dt>
                      <dd>{engine.engineVersion}</dd>
                    </div>
                    <div>
                      <dt>Protocol</dt>
                      <dd>v{engine.protocolVersion}</dd>
                    </div>
                    <div>
                      <dt>Target</dt>
                      <dd>
                        {engine.platform} · {engine.arch}
                      </dd>
                    </div>
                  </dl>
                ) : engine.state === 'error' ? (
                  <div role="alert" className="error-banner">
                    <strong>{engine.code}</strong>
                    <br />
                    {engine.message}
                  </div>
                ) : (
                  <p role="status">Waiting for the helper handshake…</p>
                )}
                <button
                  className="button secondary"
                  disabled={engine.state === 'connecting'}
                  onClick={() => void reconnect()}
                >
                  <Icon name="refresh" size={16} />
                  Reconnect engine
                </button>
              </section>
              <section className="settings-panel">
                <div className="panel-heading">
                  <h2>About LEU</h2>
                  <span className="version-pill">M0</span>
                </div>
                <dl className="settings-list">
                  <div>
                    <dt>Application</dt>
                    <dd>{app?.version ?? 'Loading…'}</dd>
                  </div>
                  <div>
                    <dt>Electron</dt>
                    <dd>{app?.electronVersion ?? 'Loading…'}</dd>
                  </div>
                  <div>
                    <dt>Build</dt>
                    <dd>{app ? (app.packaged ? 'Packaged' : 'Development') : 'Loading…'}</dd>
                  </div>
                  <div>
                    <dt>License</dt>
                    <dd>MIT</dd>
                  </div>
                  <div>
                    <dt>Appearance</dt>
                    <dd>Follows your system</dd>
                  </div>
                </dl>
              </section>
            </>
          )}
          <div className="notice" role="status" aria-live="polite">
            {notice}
          </div>
        </div>
      </main>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  detail,
}: {
  icon: 'apps' | 'drive' | 'user';
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="stat-card">
      <div className="stat-label">
        <span>{label}</span>
        <Icon name={icon} size={18} />
      </div>
      <strong>{value}</strong>
      <p>{detail}</p>
    </div>
  );
}
function AppIcon({ program, large = false }: { program: Program; large?: boolean }) {
  return (
    <span aria-hidden="true" className={`app-icon ${program.color} ${large ? 'large' : ''}`}>
      {program.initials}
    </span>
  );
}
function PageHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <section className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>
          {title}
          <span>.</span>
        </h1>
        <p>{description}</p>
      </div>
    </section>
  );
}
