import { useEffect, useState, useSyncExternalStore } from 'react';

const MAX_CACHED_ICONS = 256;
// Shared by list rows and the details panel, so revisiting a page does not reload its icons.
// A value of null means the program has no icon LEU can show.
const cache = new Map<string, string | null>();
const pending = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(): void {
  for (const listener of listeners) listener();
}

function load(programId: string): void {
  if (pending.has(programId)) return;
  const request = window.leu
    .getProgramIcon(programId)
    .catch(() => null)
    .then((icon) => {
      pending.delete(programId);
      cache.set(programId, icon);
      if (cache.size > MAX_CACHED_ICONS) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
      notify();
    });
  pending.set(programId, request);
}

/** Retries programs without an icon, which may have failed while the helper was unavailable. */
export function retryMissingProgramIcons(): void {
  for (const [programId, icon] of cache) if (icon === null) cache.delete(programId);
  notify();
}

/**
 * Requests a program's icon once its element scrolls near the viewport. Returns undefined
 * until the icon is known, then a data URL or null.
 */
export function useProgramIcon(programId: string): {
  ref: (element: Element | null) => void;
  icon: string | null | undefined;
} {
  const icon = useSyncExternalStore(
    subscribe,
    () => cache.get(programId),
    () => undefined,
  );
  const [element, setElement] = useState<Element | null>(null);
  useEffect(() => {
    if (!element || icon !== undefined || !window.leu) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        load(programId);
      },
      { rootMargin: '200px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [element, icon, programId]);
  return { ref: setElement, icon };
}
