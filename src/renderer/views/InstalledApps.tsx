import { useState } from 'react';
import type { Inventory, Program } from '../../contracts/bridge';
import { Icon } from '../icons';
import { AppIcon } from '../components/AppIcon';
import {
  filterPrograms,
  formatReportedDate,
  formatSize,
  getSizeEstimate,
  isListed,
} from '../programs';

interface InstalledAppsProps {
  programs: Program[];
  inventory: Inventory | undefined;
  loading: boolean;
  error: string;
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
  inventory,
  loading,
  error,
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
  const [showHidden, setShowHidden] = useState(false);
  const [page, setPage] = useState(0);
  const demo = inventory?.source === 'demo';
  const available = inventory !== undefined && inventory.status !== 'unavailable';
  const summary = programs.filter((program) => isListed(program, showHidden));
  const visible = filterPrograms(programs, query, scope, sort, showHidden);
  const pageCount = Math.max(1, Math.ceil(visible.length / 100));
  const currentPage = Math.min(page, pageCount - 1);
  const rows = visible.slice(currentPage * 100, (currentPage + 1) * 100);
  const selected = programs.find((program) => program.id === selectedId);
  const selectionHidden =
    selected !== undefined && !visible.some((program) => program.id === selectedId);
  const selectionOnOtherPage =
    selected !== undefined &&
    !selectionHidden &&
    !rows.some((program) => program.id === selectedId);
  const sizeEstimate = getSizeEstimate(summary);
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
        <button className="button secondary" disabled={loading} onClick={() => void refresh()}>
          <Icon name="refresh" size={16} />
          {loading ? 'Reading applications…' : 'Refresh list'}
        </button>
      </section>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      <div className={demo ? 'demo-banner' : 'demo-banner live-inventory-banner'}>
        <Icon name="info" size={18} />
        <div>
          {demo ? (
            <>
              <strong>You’re exploring sample data.</strong> These programs are synthetic examples.
            </>
          ) : (
            <>
              <strong>Read-only Windows inventory.</strong> Microsoft Store packages and
              unregistered portable apps are outside this preview.
            </>
          )}
        </div>
        <span>{demo ? 'SAMPLE' : 'LOCAL'}</span>
      </div>
      {inventory && inventory.issues.length > 0 && (
        <details className="error-banner inventory-issues">
          <summary>
            {inventory.status === 'unavailable'
              ? 'Windows registry sources could not be read. Results may be incomplete.'
              : inventory.status === 'partial'
                ? 'Some registry records could not be read. Results may be incomplete.'
                : 'Some metadata values could not be read and are shown as unknown.'}
          </summary>
          <ul>
            {inventory.issues.map((issue, index) => (
              <li key={index}>
                <strong>{issue.code}</strong> · {issue.source.hive} · {issue.source.view}
                <code>{issue.source.key}</code>
                {issue.message}
              </li>
            ))}
          </ul>
          {inventory.issuesOmitted > 0 && (
            <p>{inventory.issuesOmitted} additional warnings omitted.</p>
          )}
        </details>
      )}
      <section
        className="stats"
        aria-label={demo ? 'Sample inventory summary' : 'Windows inventory summary'}
      >
        <Stat
          icon="apps"
          label="Applications"
          value={available ? String(summary.length).padStart(2, '0') : '—'}
          detail={demo ? 'In this sample workspace' : 'Available desktop registrations'}
        />
        <Stat
          icon="drive"
          label="Partial size estimate"
          value={formatSize(sizeEstimate.reportedSizeBytes)}
          detail={
            available
              ? `${sizeEstimate.knownSizeCount} of ${summary.length} apps report a size`
              : 'No size estimates available'
          }
        />
        <Stat
          icon="user"
          label="Installed for you"
          value={
            available
              ? String(summary.filter((program) => program.scope === 'user').length).padStart(
                  2,
                  '0',
                )
              : '—'
          }
          detail="Current user applications"
        />
      </section>
      <div className="inventory-layout">
        <section
          className="program-panel"
          aria-label={demo ? 'Sample installed programs' : 'Windows installed programs'}
          aria-busy={loading}
        >
          <div className="panel-heading">
            <h2>
              Your applications <span>{summary.length}</span>
            </h2>
            <span className="muted tiny">{demo ? 'Sample inventory' : 'Windows registry'}</span>
          </div>
          <div className="toolbar">
            <label className="search-field">
              <Icon name="search" size={18} />
              <input
                aria-label="Search applications"
                placeholder="Search apps or publishers…"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(0);
                }}
              />
            </label>
            <label className="sort-label">
              <span>Sort by</span>
              <select
                aria-label="Sort applications"
                value={sort}
                onChange={(event) => {
                  setSort(event.target.value);
                  setPage(0);
                }}
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
                onClick={() => {
                  setScope(filter.value);
                  setPage(0);
                }}
              >
                {filter.label}
              </button>
            ))}
          </div>
          <label className="system-filter">
            <input
              type="checkbox"
              checked={showHidden}
              onChange={(event) => {
                setShowHidden(event.target.checked);
                setPage(0);
              }}
            />
            Include system components and updates
          </label>
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
              {rows.map((program) => (
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
                        <small>{program.publisher ?? 'Unknown publisher'}</small>
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
          {loading && !inventory && (
            <div className="empty-search" role="status">
              Reading installed desktop applications…
            </div>
          )}
          {!loading && visible.length === 0 && (
            <div className="empty-search">
              <Icon name="search" size={30} />
              <h3>
                {error && programs.length === 0 ? 'Inventory unavailable' : 'No applications found'}
              </h3>
              <p>
                {error && programs.length === 0
                  ? 'Check the engine connection and retry the inventory.'
                  : 'Try a different search or installation scope, or include system components and updates.'}
              </p>
              <button
                className="text-button"
                onClick={() => {
                  setQuery('');
                  setScope('all');
                  setPage(0);
                }}
              >
                Clear filters
              </button>
            </div>
          )}
          <div className="table-footer">
            <span>
              Showing {visible.length === 0 ? 0 : currentPage * 100 + 1}–
              {Math.min((currentPage + 1) * 100, visible.length)} of {visible.length} matches
            </span>
            <span>
              <span className="mini-dot" />{' '}
              {demo
                ? 'Sample data'
                : error
                  ? available
                    ? 'Previous result'
                    : 'Inventory unavailable'
                  : inventory?.status === 'partial'
                    ? 'Partial inventory'
                    : 'Local inventory'}
            </span>
          </div>
          {pageCount > 1 && (
            <div className="pagination" aria-label="Application pages">
              <button
                className="button secondary"
                disabled={currentPage === 0}
                onClick={() => setPage(currentPage - 1)}
              >
                Previous page
              </button>
              <span>
                Page {currentPage + 1} of {pageCount}
              </span>
              <button
                className="button secondary"
                disabled={currentPage + 1 >= pageCount}
                onClick={() => setPage(currentPage + 1)}
              >
                Next page
              </button>
            </div>
          )}
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
              {selectionOnOtherPage && (
                <div className="detail-note" role="status">
                  <Icon name="info" size={16} />
                  <p>This application is on another page.</p>
                </div>
              )}
              <div className="details-identity">
                <AppIcon program={selected} large />
                <h2>{selected.name}</h2>
                <p>{selected.publisher ?? 'Unknown publisher'}</p>
                <span className="version-pill">
                  {selected.version ? `Version ${selected.version}` : 'Version unknown'}
                </span>
                {selected.systemComponent && <p>System component · read-only</p>}
                {selected.updateRegistration && <p>Update registration · read-only</p>}
              </div>
              <dl className="detail-list">
                <div>
                  <dt>Reported size</dt>
                  <dd>{formatSize(selected.reportedSizeBytes)}</dd>
                </div>
                <div>
                  <dt title="Installer-reported date; may reflect installation, repair, or update.">
                    Reported date
                  </dt>
                  <dd>{formatReportedDate(selected.reportedInstallDate)}</dd>
                </div>
                <div>
                  <dt>Installed for</dt>
                  <dd>{selected.scope === 'user' ? 'Current user' : 'All users'}</dd>
                </div>
                <div>
                  <dt>Source</dt>
                  <dd className="accent-text">
                    {demo ? 'Sample record' : `${selected.source.hive} · ${selected.source.view}`}
                  </dd>
                </div>
              </dl>
              <p className="metadata-note">
                Size and date are reported by the installer. The date may reflect a repair or
                update.
              </p>
              <div className="location">
                <span>
                  <Icon name="folder" size={16} />
                  INSTALL LOCATION
                </span>
                <code>{selected.installLocation ?? 'Unknown'}</code>
              </div>
              {!demo && (
                <div className="location">
                  <span>REGISTRY SOURCE</span>
                  <code>
                    {selected.source.hive}\{selected.source.key}
                  </code>
                </div>
              )}
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
