import type { AppInfo } from '../../contracts/bridge';
import type { Connection } from '../types';
import { Icon } from '../icons';
import { PageHeading } from '../components/PageHeading';

export function Settings({
  app,
  engine,
  onReconnect,
}: {
  app: AppInfo | undefined;
  engine: Connection;
  onReconnect: () => Promise<void>;
}) {
  return (
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
        <p>The local Rust helper handles Windows integration through a restricted connection.</p>
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
          onClick={() => void onReconnect()}
        >
          <Icon name="refresh" size={16} />
          Reconnect engine
        </button>
      </section>
      <section className="settings-panel">
        <div className="panel-heading">
          <h2>About LEU</h2>
          <span className="version-pill">M1 preview</span>
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
  );
}
