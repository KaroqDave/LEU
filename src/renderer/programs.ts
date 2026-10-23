import type { Program } from '../contracts/bridge';

/** System components and update registrations are hidden unless explicitly included. */
export function isListed(program: Program, includeHidden = false): boolean {
  return includeHidden || (!program.systemComponent && !program.updateRegistration);
}

export function filterPrograms(
  programs: Program[],
  query: string,
  scope: string,
  sort: string,
  includeHidden = false,
): Program[] {
  const needle = query.trim().toLocaleLowerCase();
  return programs
    .filter(
      (program) =>
        isListed(program, includeHidden) &&
        (scope === 'all' || program.scope === scope) &&
        `${program.name} ${program.publisher ?? ''}`.toLocaleLowerCase().includes(needle),
    )
    .sort((a, b) =>
      sort === 'size'
        ? (b.reportedSizeBytes ?? -1) - (a.reportedSizeBytes ?? -1)
        : a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
    );
}

export function formatReportedDate(value: string | null): string {
  if (value === null) return 'Unknown';
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? 'Unknown'
    : new Intl.DateTimeFormat('en', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(date);
}

export function formatSize(bytes: number | null): string {
  if (bytes === null) return 'Unknown';
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GiB`;
  return `${Math.round(bytes / 1024 ** 2)} MiB`;
}

export function getSizeEstimate(programs: readonly Program[]): {
  reportedSizeBytes: number | null;
  knownSizeCount: number;
} {
  let total = 0;
  let knownSizeCount = 0;
  for (const program of programs) {
    if (program.reportedSizeBytes !== null) {
      total += program.reportedSizeBytes;
      knownSizeCount++;
    }
  }
  return {
    reportedSizeBytes: knownSizeCount === 0 ? null : total,
    knownSizeCount,
  };
}
