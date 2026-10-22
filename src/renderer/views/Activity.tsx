import { Icon } from '../icons';
import { PageHeading } from '../components/PageHeading';

export function Activity({ onExplore }: { onExplore: () => void }) {
  return (
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
        <button className="button secondary" onClick={onExplore}>
          Explore your applications
          <Icon name="arrow" size={16} />
        </button>
      </section>
    </>
  );
}
