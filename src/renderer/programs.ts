import type { Program } from '../contracts/bridge';

export function filterPrograms(
  programs: Program[],
  query: string,
  scope: string,
  sort: string,
): Program[] {
  const needle = query.trim().toLocaleLowerCase();
  return programs
    .filter(
      (program) =>
        (scope === 'all' || program.scope === scope) &&
        `${program.name} ${program.publisher}`.toLocaleLowerCase().includes(needle),
    )
    .sort((a, b) =>
      sort === 'size'
        ? (b.reportedSizeBytes ?? -1) - (a.reportedSizeBytes ?? -1)
        : a.name.localeCompare(b.name),
    );
}

export function formatSize(bytes: number | null): string {
  if (bytes === null) return 'Unknown';
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GiB`;
  return `${Math.round(bytes / 1024 ** 2)} MiB`;
}
