import type { Inventory, Program } from '../contracts/bridge';

// Synthetic records only; selected explicitly with --demo-inventory for captures and tests.
const programs: Omit<Program, 'source' | 'systemComponent' | 'updateRegistration'>[] = [
  {
    id: 'demo-code',
    name: 'Visual Studio Code',
    publisher: 'Microsoft Corporation',
    version: '1.104.2',
    scope: 'user',
    reportedSizeBytes: 410 * 1024 ** 2,
    reportedInstallDate: '2026-09-14',
    installLocation: 'C:\\Users\\Demo\\AppData\\Local\\Programs\\Microsoft VS Code',
  },
  {
    id: 'demo-figma',
    name: 'Figma',
    publisher: 'Figma, Inc.',
    version: '125.4.3',
    scope: 'user',
    reportedSizeBytes: 289 * 1024 ** 2,
    reportedInstallDate: '2026-09-20',
    installLocation: 'C:\\Users\\Demo\\AppData\\Local\\Figma',
  },
  {
    id: 'demo-firefox',
    name: 'Mozilla Firefox',
    publisher: 'Mozilla',
    version: '143.0.1',
    scope: 'machine',
    reportedSizeBytes: 267 * 1024 ** 2,
    reportedInstallDate: '2026-10-02',
    installLocation: 'C:\\Program Files\\Mozilla Firefox',
  },
  {
    id: 'demo-obs',
    name: 'OBS Studio',
    publisher: 'OBS Project',
    version: '32.0.1',
    scope: 'machine',
    reportedSizeBytes: 645 * 1024 ** 2,
    reportedInstallDate: '2026-09-08',
    installLocation: 'C:\\Program Files\\obs-studio',
  },
  {
    id: 'demo-sevenzip',
    name: '7-Zip',
    publisher: 'Igor Pavlov',
    version: '25.01',
    scope: 'machine',
    reportedSizeBytes: 6 * 1024 ** 2,
    reportedInstallDate: '2026-08-30',
    installLocation: 'C:\\Program Files\\7-Zip',
  },
  {
    id: 'demo-spotify',
    name: 'Spotify',
    publisher: 'Spotify AB',
    version: '1.2.73',
    scope: 'user',
    reportedSizeBytes: 342 * 1024 ** 2,
    reportedInstallDate: '2026-10-05',
    installLocation: 'C:\\Users\\Demo\\AppData\\Roaming\\Spotify',
  },
  {
    id: 'demo-blender',
    name: 'Blender',
    publisher: 'Blender Foundation',
    version: '4.5.3',
    scope: 'machine',
    reportedSizeBytes: 1240 * 1024 ** 2,
    reportedInstallDate: '2026-09-01',
    installLocation: 'C:\\Program Files\\Blender Foundation\\Blender 4.5',
  },
  {
    id: 'demo-notepad',
    name: 'Notepad++',
    publisher: 'Notepad++ Team',
    version: '8.8.5',
    scope: 'machine',
    reportedSizeBytes: null,
    reportedInstallDate: null,
    installLocation: 'C:\\Program Files\\Notepad++',
  },
];

export function getDemoInventory(): Inventory {
  return {
    source: 'demo',
    status: 'complete',
    issues: [],
    issuesOmitted: 0,
    programs: programs.map((program) => ({
      ...program,
      systemComponent: false,
      updateRegistration: false,
      source: {
        hive: program.scope === 'user' ? 'HKCU' : 'HKLM',
        view: program.scope === 'user' ? 'shared' : 'x64',
        key: 'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\' + program.id,
      },
    })),
  };
}
