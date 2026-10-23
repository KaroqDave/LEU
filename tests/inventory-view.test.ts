import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Inventory } from '../src/contracts/bridge';
import { getDemoInventory } from '../src/main/fixtures';
import { InstalledApps } from '../src/renderer/views/InstalledApps';

function render(inventory: Inventory, selectedId: string | null = null, error = '') {
  return renderToStaticMarkup(
    createElement(InstalledApps, {
      inventory,
      programs: inventory.programs,
      loading: false,
      error,
      selectedId,
      setSelectedId: () => undefined,
      query: '',
      setQuery: () => undefined,
      scope: 'all',
      setScope: () => undefined,
      sort: 'name',
      setSort: () => undefined,
      refresh: async () => undefined,
    }),
  );
}

test('bounds large lists to one page while retaining details for a selection on another page', () => {
  const inventory = getDemoInventory();
  const template = inventory.programs[0]!;
  inventory.programs = Array.from({ length: 350 }, (_, index) => ({
    ...template,
    id: `fixture-${index}`,
    name: `Fixture ${String(index).padStart(3, '0')}`,
  }));
  const html = render(inventory, 'fixture-349');
  assert.equal((html.match(/class="program-choice"/g) ?? []).length, 100);
  assert.match(html, /Next page/);
  assert.match(html, /Page 1 of 4/);
  assert.match(html, /This application is on another page/);
  assert.match(html, /<h2>Fixture 349<\/h2>/);
});

test('renders unknown metadata and actual registry provenance for live records', () => {
  const template = getDemoInventory().programs[0]!;
  const program = {
    ...template,
    publisher: null,
    version: null,
    reportedInstallDate: null,
    installLocation: null,
  };
  const html = render(
    { source: 'windows', status: 'complete', programs: [program], issues: [], issuesOmitted: 0 },
    program.id,
  );
  assert.match(html, /Unknown publisher/);
  assert.match(html, /Version unknown/);
  assert.match(html, /REGISTRY SOURCE/);
  assert.match(html, /Reported date/);
  assert.doesNotMatch(html, /You’re exploring sample data/);
});

test('shows an unavailable inventory without reporting known zero application counts', () => {
  const html = render(
    { source: 'windows', status: 'unavailable', programs: [], issues: [], issuesOmitted: 0 },
    null,
    'Registry sources could not be read.',
  );
  assert.match(html, /Inventory unavailable/);
  assert.equal((html.match(/<strong>—<\/strong>/g) ?? []).length, 2);
  assert.match(html, /Registry sources could not be read/);
});
