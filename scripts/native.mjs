import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const target = 'x86_64-pc-windows-msvc';

export function cargoEnvironment() {
  const local = path.join(root, '.tools', 'cargo');
  if (!existsSync(path.join(local, 'bin', 'cargo.exe'))) return { ...process.env };
  return {
    ...process.env,
    CARGO_HOME: local,
    RUSTUP_HOME: path.join(root, '.tools', 'rustup'),
    PATH: `${path.join(local, 'bin')}${path.delimiter}${process.env.PATH ?? ''}`,
  };
}

export async function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: 'inherit',
      windowsHide: true,
      ...options,
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(command)} failed (${signal ?? code}).`));
    });
  });
}

export async function native(action) {
  const env = cargoEnvironment();
  const cargo =
    env.CARGO_HOME && existsSync(path.join(env.CARGO_HOME, 'bin', 'cargo.exe'))
      ? path.join(env.CARGO_HOME, 'bin', 'cargo.exe')
      : 'cargo';
  const commands = {
    build: [['build', '--release', '--locked', '--target', target]],
    test: [['test', '--locked', '--target', target]],
    lint: [
      ['fmt', '--all', '--check'],
      ['clippy', '--locked', '--target', target, '--all-targets', '--', '-D', 'warnings'],
    ],
  };
  if (!Object.hasOwn(commands, action)) throw new Error(`Unknown native task: ${action}`);
  for (const args of commands[action]) await run(cargo, args, { env });
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    await native(process.argv[2] ?? 'build');
  } catch (error) {
    console.error(
      `Native build: ${error.message}\nInstall Rust with the MSVC target and Visual Studio C++ build tools. See CONTRIBUTING.md.`,
    );
    process.exitCode = 1;
  }
}
