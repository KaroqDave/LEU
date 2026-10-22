import type { Program } from '../../contracts/bridge';
import { Icon } from '../icons';
import { AppIcon } from '../components/AppIcon';
import { filterPrograms, formatSize, getSizeEstimate } from '../programs';

interface InstalledAppsProps {
  programs: Program[];
  selectedId: string | null;
  setSelectedId: (id: string) => void;
  query: string;
  setQuery: (query: string) => void;
  scope: string;
  setScope: (scope: string) => void;
  sort: string;
  setSort: (sort: string) => void;
  refresh: () => Promise<void>;
}

export function InstalledApps({
  programs,
  selectedId,
  setSelectedId,
  query,
  setQuery,
  scope,
  setScope,
  sort,
  setSort,
  refresh,
}: InstalledAppsProps) {
  const visible = filterPrograms(programs, query, scope, sort);
  const selected = programs.find((program) => program.id === selectedId);
  const selectionHidden =
    selected !== undefined && !visible.some((program) => program.id === selectedId);
  const sizeEstimate = getSizeEstimate(programs);
  return (
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
          <strong>You’re exploring sample data.</strong> These programs are examples. Live Windows
          discovery is the next milestone.
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
          label="Partial size estimate"
          value={formatSize(sizeEstimate.reportedSizeBytes)}
          detail={`${sizeEstimate.knownSizeCount} of ${programs.length} apps report a size`}
        />
        <Stat
          icon="user"
          label="Installed for you"
          value={String(programs.filter((program) => program.scope === 'user').length).padStart(
            2,
            '0',
          )}
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
                <tr key={program.id} className={selected?.id === program.id ? 'selected-row' : ''}>
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
              {selectionHidden && (
                <div className="detail-note" role="status">
                  <Icon name="info" size={16} />
                  <p>This application is hidden by the current filters.</p>
                </div>
              )}
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
                <button className="button primary" disabled aria-describedby="uninstall-note">
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
