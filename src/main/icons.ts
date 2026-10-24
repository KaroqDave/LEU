import type { EngineResult } from '../contracts/protocol';

const MAX_CACHED_ICONS = 512;

/**
 * Loads program icons one at a time and caches them as PNG data URLs. The helper answers
 * requests in order, so icons wait for any inventory read instead of queueing behind it; a
 * request that waited in the pipe could miss its deadline and restart the helper.
 */
export class IconLoader {
  private readonly cache = new Map<string, Promise<string | null>>();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly load: (programId: string) => Promise<EngineResult<'inventory.icon'>>,
    private readonly idle: () => Promise<unknown> = () => Promise.resolve(),
  ) {}

  /** Resolves to a data URL, or null when the program has no readable icon. Never rejects. */
  get(programId: string): Promise<string | null> {
    const cached = this.cache.get(programId);
    if (cached) {
      // Refresh recency so eviction drops the least recently shown icon.
      this.cache.delete(programId);
      this.cache.set(programId, cached);
      return cached;
    }
    const icon = this.queue
      .then(() => this.idle())
      .catch(() => undefined)
      .then(() => this.load(programId))
      .then(
        (result) => (result.status === 'found' ? `data:image/png;base64,${result.png}` : null),
        () => {
          // A stopped or restarting helper is not evidence that the icon is missing.
          if (this.cache.get(programId) === icon) this.cache.delete(programId);
          return null;
        },
      );
    this.queue = icon;
    this.cache.set(programId, icon);
    if (this.cache.size > MAX_CACHED_ICONS) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    return icon;
  }

  /** Forgets cached icons, for example when the inventory is read again. */
  clear(): void {
    this.cache.clear();
  }
}
