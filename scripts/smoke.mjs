import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { promisify } from 'node:util';
import { chromium } from '@playwright/test';
import { root } from './native.mjs';

const execFileAsync = promisify(execFile);
const output = path.join(root, 'out', 'smoke');
const executable = path.join(root, 'out', 'LEU-win32-x64', 'LEU.exe');
if (!existsSync(executable)) throw new Error('Run pnpm package before pnpm smoke.');
// Inspect shipped bytes as well as source: panic strings can expose build-machine paths.
const localRoots = [root, os.homedir(), process.env.CARGO_HOME, process.env.RUSTUP_HOME]
  .filter(Boolean)
  .map((entry) => path.resolve(entry));
for (const name of ['app.asar', 'leu-engine.exe']) {
  const bytes = await readFile(path.join(path.dirname(executable), 'resources', name));
  for (const localRoot of localRoots) {
    const variants = [
      localRoot,
      localRoot.replaceAll('\\', '/'),
      JSON.stringify(localRoot).slice(1, -1),
      encodeURI(localRoot),
    ];
    for (const variant of variants) {
      for (const encoding of ['utf8', 'utf16le']) {
        assert.equal(
          bytes.includes(Buffer.from(variant, encoding)),
          false,
          `${name} must not contain local build-machine paths.`,
        );
      }
    }
  }
}
await mkdir(output, { recursive: true });
const profile = path.join(root, '.cache', 'smoke-profile');
await mkdir(profile, { recursive: true });
const unicodeDirectory = path.join(root, '.cache', 'helper path ü');
await mkdir(unicodeDirectory, { recursive: true });
const unicodeHelper = path.join(unicodeDirectory, 'leu-engine.exe');
await copyFile(path.join(path.dirname(executable), 'resources/leu-engine.exe'), unicodeHelper);
await new Promise((resolve, reject) => {
  const helper = spawn(unicodeHelper, [], { windowsHide: true });
  const timer = setTimeout(() => {
    helper.kill();
    reject(new Error('Relocated helper timed out.'));
  }, 5000);
  let data = '';
  helper.stdout.on('data', (chunk) => {
    data += chunk.toString();
  });
  helper.once('error', (error) => {
    clearTimeout(timer);
    reject(error);
  });
  helper.once('exit', (code) => {
    clearTimeout(timer);
    try {
      assert.equal(code, 0);
      assert.equal(JSON.parse(data).ok, true);
      resolve();
    } catch (error) {
      reject(error);
    }
  });
  helper.stdin.end(
    JSON.stringify({
      protocolVersion: 1,
      id: 'unicode-test',
      method: 'engine.version',
      params: {},
    }) + '\n',
  );
});
const started = performance.now();
const child = spawn(
  executable,
  [
    '--demo-inventory',
    '--remote-debugging-port=0',
    '--remote-debugging-address=127.0.0.1',
    `--user-data-dir=${profile}`,
  ],
  { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] },
);
let browser;
let closed = false;
const exited = new Promise((resolve) =>
  child.once('exit', (code) => {
    closed = true;
    resolve(code);
  }),
);
const errors = [];

async function verifyNetworkPolicy(page) {
  let received = 0;
  const server = createServer((_request, response) => {
    received++;
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.end('Unexpected network request');
  });
  server.on('upgrade', (_request, socket) => {
    received++;
    socket.destroy();
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const cdp = await page.context().newCDPSession(page);
  try {
    // Confirm CSP blocks connections, then bypass it to exercise the session policy separately.
    assert.equal(
      await page.evaluate(() =>
        fetch(location.href).then(
          () => false,
          () => true,
        ),
      ),
      true,
    );
    await cdp.send('Page.setBypassCSP', { enabled: true });
    await page.reload();
    assert.equal(await page.evaluate(async () => (await fetch(location.href)).ok), true);
    const url = `http://127.0.0.1:${server.address().port}/privacy-check`;
    const failedRequest = page.waitForEvent('requestfailed', {
      predicate: (request) => request.url() === url,
    });
    const blocked = await page.evaluate(async (url) => {
      const http = await fetch(url).then(
        () => false,
        () => true,
      );
      const websocket = await new Promise((resolve) => {
        const socket = new WebSocket(url.replace('http:', 'ws:'));
        const timer = setTimeout(() => {
          socket.close();
          resolve(false);
        }, 3000);
        socket.onerror = () => {
          clearTimeout(timer);
          resolve(true);
        };
        socket.onopen = () => {
          clearTimeout(timer);
          socket.close();
          resolve(false);
        };
      });
      return { http, websocket };
    }, url);
    assert.deepEqual(blocked, { http: true, websocket: true });
    assert.equal((await failedRequest).failure().errorText, 'net::ERR_BLOCKED_BY_CLIENT');
    assert.equal(received, 0, 'Blocked requests must never reach the server.');
  } finally {
    await cdp.send('Page.setBypassCSP', { enabled: false });
    await page.reload();
    await cdp.detach();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

async function metrics() {
  const script = `
$all = @(Get-CimInstance Win32_Process)
$ids = [System.Collections.Generic.HashSet[int]]::new()
[void]$ids.Add(${child.pid})
do {
  $added = $false
  foreach ($process in $all) {
    if ($ids.Contains([int]$process.ParentProcessId) -and $ids.Add([int]$process.ProcessId)) { $added = $true }
  }
} while ($added)
$counters = @(Get-CimInstance Win32_PerfRawData_PerfProc_Process)
@($all | Where-Object { $ids.Contains([int]$_.ProcessId) } | ForEach-Object {
  $entry = $_
  $counter = $counters | Where-Object { $_.IDProcess -eq $entry.ProcessId } | Select-Object -First 1
  [pscustomobject]@{
    pid = [int]$entry.ProcessId; name = $entry.Name
    cpuSeconds = ([double]$entry.KernelModeTime + [double]$entry.UserModeTime) / 10000000
    privateWorkingSetBytes = [double]$counter.WorkingSetPrivate
    privateBytes = [double]$counter.PrivateBytes
  }
}) | ConvertTo-Json -Compress
`;
  const { stdout } = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    { windowsHide: true, timeout: 15000 },
  );
  const entries = JSON.parse(stdout.trim());
  return Array.isArray(entries) ? entries : [entries];
}

try {
  const endpoint = await new Promise((resolve, reject) => {
    let log = '';
    const timer = setTimeout(() => reject(new Error(`No debug endpoint. ${log}`)), 20000);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`App exited before debugger connected (${code}). ${log}`));
    });
    child.stderr.on('data', (data) => {
      log = (log + data.toString()).slice(-16000);
      const match = log.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
  });
  browser = await chromium.connectOverCDP(endpoint);
  const context = browser.contexts()[0];
  const page = context.pages()[0] ?? (await context.waitForEvent('page'));
  page.on('pageerror', (error) => errors.push(error.message));
  await page.waitForURL('leu://app/**');
  await page.getByRole('heading', { name: 'Installed apps.' }).waitFor();
  await page.getByRole('button', { name: /Engine connected/ }).waitFor();
  const readyMs = Math.round(performance.now() - started);
  assert.equal(await page.locator('.program-choice').count(), 8);
  assert.equal(await page.locator('.program-choice[aria-pressed="true"]').count(), 0);
  await page.getByText('Select an application to view its details.', { exact: true }).waitFor();
  await page.getByText('7 of 8 apps report a size', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  assert.equal(await page.evaluate(() => typeof window.process), 'undefined');
  assert.deepEqual(await page.evaluate(() => Object.keys(window.leu).sort()), [
    'getAppInfo',
    'getEngineStatus',
    'getProgramIcon',
    'listPrograms',
    'onEngineStatus',
    'restartEngine',
  ]);
  // Sample records are not live registrations, so they keep their placeholders.
  assert.equal(await page.evaluate(() => window.leu.getProgramIcon('demo-figma')), null);
  assert.equal(await page.locator('.app-icon img').count(), 0);
  await verifyNetworkPolicy(page);
  await page.getByRole('button', { name: /Engine connected/ }).waitFor();
  await page.setViewportSize({ width: 1380, height: 1060 });
  const figma = page.locator('.program-choice').filter({ hasText: 'Figma' });
  await figma.focus();
  await page.keyboard.press('Enter');
  assert.equal(await figma.getAttribute('aria-pressed'), 'true');
  await page.locator('.details-panel h2').filter({ hasText: 'Figma' }).waitFor();
  await page.screenshot({ path: path.join(output, 'installed-apps-light.png'), scale: 'css' });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ path: path.join(output, 'installed-apps-dark.png'), scale: 'css' });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.getByRole('textbox', { name: 'Search applications' }).fill('Mozilla');
  assert.equal(await page.locator('.program-choice').count(), 1);
  await page.locator('.details-panel h2').filter({ hasText: 'Figma' }).waitFor();
  await page
    .getByText('This application is hidden by the current filters.', { exact: true })
    .waitFor();
  assert.equal(await page.locator('.program-choice[aria-pressed="true"]').count(), 0);
  await page.getByRole('button', { name: 'System wide', exact: true }).click();
  await page.locator('.details-panel h2').filter({ hasText: 'Figma' }).waitFor();
  await page.getByRole('textbox', { name: 'Search applications' }).fill('missing-application');
  await page.getByRole('heading', { name: 'No applications found' }).waitFor();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  assert.equal(await figma.getAttribute('aria-pressed'), 'true');
  assert.equal(
    await page
      .getByText('This application is hidden by the current filters.', { exact: true })
      .count(),
    0,
  );
  await page.getByRole('button', { name: 'Refresh list', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Sample list refreshed.' }).waitFor();
  assert.equal(await figma.getAttribute('aria-pressed'), 'true');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.locator('.connection-badge').filter({ hasText: 'Connected' }).waitFor();
  await page.getByRole('button', { name: 'Reconnect engine' }).click();
  await page.locator('.connection-badge').filter({ hasText: 'Connected' }).waitFor();
  await page.screenshot({ path: path.join(output, 'settings.png') });
  await page.getByRole('button', { name: 'Activity', exact: true }).click();
  await page.getByRole('heading', { name: 'A fresh start.' }).waitFor();
  await page.getByRole('button', { name: /Explore your applications/ }).click();
  assert.equal(await figma.getAttribute('aria-pressed'), 'true');
  assert.equal(
    await page.getByRole('button', { name: 'Uninstall application' }).isDisabled(),
    true,
  );
  const firstTime = performance.now();
  const before = await metrics();
  await new Promise((resolve) => setTimeout(resolve, 10000));
  const after = await metrics();
  const duration = (performance.now() - firstTime) / 1000;
  const helper = after.find((entry) => entry.name === 'leu-engine.exe');
  assert.ok(helper, 'The packaged app must own a helper process.');
  process.kill(helper.pid);
  await page.getByRole('button', { name: /Engine unavailable/ }).waitFor();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByText('ENGINE_EXITED', { exact: true }).waitFor();
  await page.screenshot({ path: path.join(output, 'engine-failure.png') });
  await page.getByRole('button', { name: 'Reconnect engine' }).click();
  await page.locator('.connection-badge').filter({ hasText: 'Connected' }).waitFor();
  const finalProcesses = await metrics();
  const sum = (items, key) => items.reduce((total, item) => total + item[key], 0);
  const measurement = {
    measuredAt: new Date().toISOString(),
    os: os.release(),
    cpu: os.cpus()[0]?.model,
    logicalProcessors: os.cpus().length,
    memoryGiB: Math.round(os.totalmem() / 1024 ** 3),
    automatedStartupMs: readyMs,
    sampleDurationSeconds: Number(duration.toFixed(2)),
    idleCpuPercentOfMachine: Number(
      (
        ((sum(after, 'cpuSeconds') - sum(before, 'cpuSeconds')) / duration / os.cpus().length) *
        100
      ).toFixed(2),
    ),
    summedPrivateWorkingSetMiB: Number(
      (sum(after, 'privateWorkingSetBytes') / 1024 ** 2).toFixed(2),
    ),
    summedPrivateBytesMiB: Number((sum(after, 'privateBytes') / 1024 ** 2).toFixed(2)),
    helperBytes: (await stat(path.join(path.dirname(executable), 'resources/leu-engine.exe'))).size,
    processes: after,
    notes:
      'One automated launch with Chromium debugging enabled and eight demo records. Not a 30-run cold startup or a 60-second idle benchmark.',
  };
  assert.deepEqual(errors, []);
  await page.close();
  const exitCode = await Promise.race([
    exited,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Packaged app did not exit.')), 10000),
    ),
  ]);
  assert.equal(exitCode, 0);
  for (const entry of finalProcesses.filter((entry) => entry.name === 'leu-engine.exe')) {
    assert.throws(() => process.kill(entry.pid, 0), 'Helper must exit when LEU closes.');
  }
  await writeFile(path.join(output, 'baseline.json'), JSON.stringify(measurement, null, 2) + '\n');
  console.log(JSON.stringify(measurement, null, 2));
  console.log(
    'Packaged smoke test passed: artifact privacy, network policy, sandbox, bridge, helper, navigation, search, reconnect, shutdown.',
  );
} finally {
  await browser?.close();
  if (!closed) child.kill();
}
