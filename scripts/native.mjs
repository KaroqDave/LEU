import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

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

export function cargo() {
  const env = cargoEnvironment();
  const command =
    env.CARGO_HOME && existsSync(path.join(env.CARGO_HOME, 'bin', 'cargo.exe'))
      ? path.join(env.CARGO_HOME, 'bin', 'cargo.exe')
      : 'cargo';
  return { command, env };
}

export async function native(action) {
  const { command, env } = cargo();
  // Cargo merges these target flags with .cargo/config.toml, retaining +crt-static.
  const remappedPaths = [
    [os.homedir(), '/user'],
    [root, '/leu'],
    [env.CARGO_HOME ?? path.join(os.homedir(), '.cargo'), '/cargo'],
    [env.RUSTUP_HOME ?? path.join(os.homedir(), '.rustup'), '/rustup'],
  ].map(([from, to]) => `--remap-path-prefix=${path.resolve(from)}=${to}`);
  const remapConfig = `target.${target}.rustflags=${JSON.stringify(remappedPaths)}`;
  // Check both the shipped helper and the schema feature used by the contract generator.
  const commands = {
    build: [['build', '--release', '--locked', '--target', target, '--config', remapConfig]],
    clean: [['clean', '-p', 'leu-engine', '--target', target]],
    test: [
      ['test', '--locked', '--target', target],
      ['test', '--locked', '--target', target, '--all-features'],
    ],
    lint: [
      ['fmt', '--all', '--check'],
      ['clippy', '--locked', '--target', target, '--all-targets', '--', '-D', 'warnings'],
      [
        'clippy',
        '--locked',
        '--target',
        target,
        '--all-targets',
        '--all-features',
        '--',
        '-D',
        'warnings',
      ],
    ],
  };
  if (!Object.hasOwn(commands, action)) throw new Error(`Unknown native task: ${action}`);
  for (const args of commands[action]) await run(command, args, { env });
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
