import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getDemoInventory } from '../src/main/fixtures';
import { filterPrograms, formatSize } from '../src/renderer/programs';

test('searches by publisher within the chosen installation scope', () => {
  const programs = getDemoInventory().programs;
  assert.equal(filterPrograms(programs, ' MICROSOFT ', 'user', 'name')[0]?.id, 'demo-code');
  assert.equal(filterPrograms(programs, 'Microsoft', 'machine', 'name').length, 0);
});
test('keeps unknown sizes distinct and sorts them after known sizes', () => {
  const sorted = filterPrograms(getDemoInventory().programs, '', 'all', 'size');
  assert.equal(sorted.at(-1)?.reportedSizeBytes, null);
  assert.equal(formatSize(null), 'Unknown');
  assert.equal(formatSize(0), '0 MiB');
});
