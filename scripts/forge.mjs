import path from 'node:path';
import { existsSync } from 'node:fs';
import { native, root, run } from './native.mjs';

try {
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    throw new Error('M0 builds currently target Windows x64.');
  }
  await native('build');
  if (!existsSync(path.join(root, 'assets/branding/app-icons/leu.ico'))) {
    await run(process.execPath, [path.join(root, 'scripts/branding.cjs')]);
  }
  await run(process.execPath, [
    path.join(root, 'node_modules/@electron-forge/cli/dist/electron-forge.js'),
    ...process.argv.slice(2),
  ]);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
