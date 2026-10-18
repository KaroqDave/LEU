import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { resolveAsset, resolveHelperPath } from '../src/main/paths';

test('locates the helper outside asar in a packaged app', () => {
  assert.equal(
    resolveHelperPath(true, 'unused.asar', 'C:\\LEU Space ü\\resources'),
    path.join('C:\\LEU Space ü\\resources', 'leu-engine.exe'),
  );
});
test('restricts custom protocol assets to the renderer directory', () => {
  const root = path.resolve('renderer');
  assert.equal(resolveAsset(root, '/index.html'), path.join(root, 'index.html'));
  for (const input of [
    '/../main/index.js',
    '/%2e%2e/main.js',
    '/%5c..%5cmain.js',
    '/secret.json',
    '/C:/secret.js',
    '/%00.js',
    '/%invalid',
  ]) {
    assert.equal(resolveAsset(root, input), undefined, input);
  }
});
