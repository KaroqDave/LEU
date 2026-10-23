import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getDemoInventory } from '../src/main/fixtures';
import {
  filterPrograms,
  formatReportedDate,
  formatSize,
  getSizeEstimate,
  isListed,
} from '../src/renderer/programs';

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

test('reports size coverage and sums only known installer estimates', () => {
  const programs = getDemoInventory().programs;
  assert.deepEqual(getSizeEstimate(programs), {
    reportedSizeBytes: (410 + 289 + 267 + 645 + 6 + 342 + 1240) * 1024 ** 2,
    knownSizeCount: 7,
  });
  assert.deepEqual(
    getSizeEstimate(programs.map((program) => ({ ...program, reportedSizeBytes: 0 }))),
    {
      reportedSizeBytes: 0,
      knownSizeCount: programs.length,
    },
  );
});

test('does not invent a zero size for an empty inventory or missing installer estimates', () => {
  assert.deepEqual(getSizeEstimate([]), { reportedSizeBytes: null, knownSizeCount: 0 });
  assert.deepEqual(
    getSizeEstimate(
      getDemoInventory().programs.map((program) => ({ ...program, reportedSizeBytes: null })),
    ),
    { reportedSizeBytes: null, knownSizeCount: 0 },
  );
});

test('hides system components by default and does not search null publisher text', () => {
  const program = { ...getDemoInventory().programs[0]!, publisher: null, systemComponent: true };
  assert.equal(filterPrograms([program], '', 'all', 'name').length, 0);
  assert.equal(filterPrograms([program], '', 'all', 'name', true).length, 1);
  assert.equal(filterPrograms([program], 'null', 'all', 'name', true).length, 0);
  assert.equal(formatReportedDate(null), 'Unknown');
  assert.equal(formatReportedDate('not a date'), 'Unknown');
  assert.equal(formatReportedDate('2024-02-29'), 'Feb 29, 2024');
});

test('hides update registrations with system components until both are included', () => {
  const update = { ...getDemoInventory().programs[0]!, updateRegistration: true };
  assert.equal(isListed(update), false);
  assert.equal(isListed(update, true), true);
  assert.equal(filterPrograms([update], '', 'all', 'name').length, 0);
  assert.equal(filterPrograms([update], '', 'all', 'name', true).length, 1);
});
