// Verifies the live provider without saving or printing software names, paths, or screenshots.
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import Ajv from 'ajv';
import { chromium } from '@playwright/test';
import { root } from './native.mjs';

const directory = path.join(root, 'out/LEU-win32-x64');
const development = process.argv.includes('--development');
const executable = path.join(directory, 'LEU.exe');
if (!existsSync(executable)) throw new Error('Run pnpm package before pnpm smoke:inventory.');
const contract = JSON.parse(await readFile(path.join(root, 'src/contracts/contract.json'), 'utf8'));
const validate = new Ajv({ strict: true }).compile(contract.methods['inventory.list'].result);

const native = await new Promise((resolve, reject) => {
  const helper = spawn(path.join(directory, 'resources/leu-engine.exe'), [], { windowsHide: true });
  const chunks = [];
  let bytes = 0;
  const timer = setTimeout(() => {
    helper.kill();
    reject(new Error('Live inventory helper timed out.'));
  }, 15_000);
  helper.stdout.on('data', (chunk) => {
    bytes += chunk.length;
    if (bytes > contract.limits.responseBytes) {
      helper.kill();
      reject(new Error('Live inventory exceeded the response limit.'));
    } else chunks.push(chunk);
  });
  helper.stderr.resume();
  helper.once('error', reject);
  helper.once('close', (code) => {
    clearTimeout(timer);
    try {
      assert.ok(code === 0, 'The live inventory helper must exit normally.');
      const response = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      assert.ok(
        response.ok && response.id === 'inventory-smoke',
        'Inventory request must succeed.',
      );
      assert.ok(validate(response.result), 'Live inventory must match the generated schema.');
      assert.ok(response.result.status !== 'unavailable', 'Registry sources must be readable.');
      assert.ok(
        new Set(response.result.programs.map((program) => program.id)).size ===
          response.result.programs.length,
        'Registrations must have unique source identities.',
      );
      resolve(response.result);
    } catch (error) {
      reject(error);
    }
  });
  helper.stdin.on('error', reject);
  helper.stdin.end(
    JSON.stringify({
      protocolVersion: contract.protocolVersion,
      id: 'inventory-smoke',
      method: 'inventory.list',
      params: {},
    }) + '\n',
  );
});

console.log(
  JSON.stringify({
    status: native.status,
    registrations: native.programs.length,
    warnings: native.issues.length + native.issuesOmitted,
    sources: Object.fromEntries(
      ['HKCU:shared', 'HKLM:x64', 'HKLM:x86'].map((source) => [
        source,
        native.programs.filter(
          (program) => `${program.source.hive}:${program.source.view}` === source,
        ).length,
      ]),
    ),
  }),
);

const appArgs = [
  '--remote-debugging-port=0',
  '--remote-debugging-address=127.0.0.1',
  `--user-data-dir=${path.join(root, '.cache/inventory-smoke-profile')}`,
];
const child = spawn(
  development ? process.execPath : executable,
  development ? [path.join(root, 'scripts/forge.mjs'), 'start', '--', ...appArgs] : appArgs,
  { windowsHide: true, stdio: ['ignore', development ? 'pipe' : 'ignore', 'pipe'] },
);
let closed = false;
const exited = new Promise((resolve) =>
  child.once('exit', (code) => {
    closed = true;
    resolve(code);
  }),
);
let browser;
try {
  const endpoint = await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Live app did not expose its test endpoint.')),
      20_000,
    );
    let log = '';
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', () => {
      clearTimeout(timer);
      reject(new Error('Live app exited before the test connected.'));
    });
    const read = (chunk) => {
      log = (log + chunk.toString()).slice(-16000);
      const match = log.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    };
    child.stderr.on('data', read);
    if (development) child.stdout.on('data', read);
  });
  browser = await chromium.connectOverCDP(endpoint);
  const context = browser.contexts()[0];
  const page = context.pages()[0] ?? (await context.waitForEvent('page'));
  const errors = [];
  page.on('pageerror', () => errors.push('Renderer error'));
  await page.getByRole('heading', { name: 'Installed apps.' }).waitFor();
  await page.locator('.program-panel[aria-busy="false"]').waitFor();
  const inventory = await page.evaluate(() => window.leu.listPrograms());
  const { source, ...result } = inventory;
  assert.ok(
    source === 'windows' && validate(result),
    'The normal application must use the live provider.',
  );
  assert.ok(result.status !== 'unavailable', 'The application must receive a readable inventory.');
  await page.getByText('Read-only Windows inventory.', { exact: true }).waitFor();
  const count = await page.locator('.program-choice').count();
  assert.ok(count <= 100, 'The table must bound rendered rows.');
  if (count > 0) {
    await page.bringToFront();
    await page.locator('.program-choice').first().press('Enter');
    await page
      .waitForFunction(
        () => document.querySelector('.program-choice[aria-pressed="true"]') !== null,
        null,
        { timeout: 5000 },
      )
      .catch(() => {
        throw new Error('Keyboard selection did not activate an application row.');
      });
    await page.locator('.details-panel h2').waitFor();
    assert.ok(
      await page.getByRole('button', { name: 'Uninstall application', exact: true }).isDisabled(),
      'Discovery must not enable unsupported uninstall operations.',
    );
    const next = page.getByRole('button', { name: 'Next page', exact: true });
    if ((await next.count()) > 0) {
      await next.click();
      await page.getByText('This application is on another page.', { exact: true }).waitFor();
      assert.ok(
        (await page.locator('.program-choice').count()) <= 100,
        'Subsequent pages must also be bounded.',
      );
      await page.getByRole('button', { name: 'Previous page', exact: true }).click();
    }
    await page.getByRole('button', { name: 'Refresh list', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Windows inventory refreshed.' }).waitFor();
    assert.ok(
      (await page.locator('.program-choice[aria-pressed="true"]').count()) === 1,
      'A stable selected registration must survive refresh.',
    );
  }
  assert.ok(errors.length === 0, 'Live inventory must not cause renderer errors.');
  await page.close();
  if (!development) {
    let closeTimer;
    const code = await Promise.race([
      exited,
      new Promise((_, reject) => {
        closeTimer = setTimeout(() => reject(new Error('Live app did not close.')), 10_000);
      }),
    ]).finally(() => clearTimeout(closeTimer));
    assert.ok(code === 0, 'The live app must exit normally.');
  }
  console.log(`Live UI verified in ${development ? 'development' : 'packaged'} mode.`);
  console.log('Live Windows inventory smoke test passed. No inventory or screenshots saved.');
} finally {
  await browser?.close();
  if (!closed) {
    if (development)
      await new Promise((resolve) =>
        execFile(
          'taskkill',
          ['/PID', String(child.pid), '/T', '/F'],
          { windowsHide: true },
          resolve,
        ),
      );
    else child.kill();
  }
}
