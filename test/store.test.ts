import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { renderMarkdown } from '../src/report.ts';
import { createInitialState } from '../src/state.ts';
import { InvalidRunFileError, loadState, saveState } from '../src/store.ts';
import { completeState, project } from './fixtures.ts';

async function tempFile(name: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'brandstate-'));
  return join(dir, name);
}

describe('saveState / loadState', () => {
  it('round-trips a complete state', async () => {
    const path = await tempFile('brand.json');
    const state = completeState();
    await saveState(path, state);

    assert.deepEqual(await loadState(path), state);
  });

  it('round-trips a state that has only been partly derived', async () => {
    const path = await tempFile('brand.json');
    const state = createInitialState(project);
    await saveState(path, state);

    assert.deepEqual(await loadState(path), state);
  });

  it('creates the parent directory', async () => {
    const path = join(await mkdtemp(join(tmpdir(), 'brandstate-')), 'nested', 'deeper', 'brand.json');
    await saveState(path, completeState());
    assert.ok((await readFile(path, 'utf8')).length > 0);
  });

  it('writes byte-identical files for an unchanged state', async () => {
    const [a, b] = await Promise.all([tempFile('a.json'), tempFile('b.json')]);
    const state = completeState();
    await saveState(a, state);
    await saveState(b, structuredClone(state));

    assert.equal(await readFile(a, 'utf8'), await readFile(b, 'utf8'));
  });

  it('names the offending field when the file is not a valid BrandState', async () => {
    const path = await tempFile('broken.json');
    const state = completeState();
    (state.positioning as { category?: string }).category = undefined;
    await writeFile(path, JSON.stringify(state), 'utf8');

    await assert.rejects(() => loadState(path), (error: unknown) => {
      assert.ok(error instanceof InvalidRunFileError);
      assert.match(error.message, /positioning\.category/);
      return true;
    });
  });

  it('reports invalid JSON as such', async () => {
    const path = await tempFile('broken.json');
    await writeFile(path, '{ not json', 'utf8');

    await assert.rejects(() => loadState(path), (error: unknown) => {
      assert.ok(error instanceof InvalidRunFileError);
      assert.match(error.message, /not valid JSON/);
      return true;
    });
  });
});

describe('renderMarkdown', () => {
  it('leads with the final brand name and tagline', () => {
    const markdown = renderMarkdown(completeState());
    assert.match(markdown, /^# Throughline\n/);
    assert.match(markdown, /> The work you already repeat\./);
  });

  it('includes every derived section', () => {
    const markdown = renderMarkdown(completeState());
    for (const heading of [
      'Discovery',
      'Positioning',
      'Shape',
      'Visual direction',
      'Strategy options',
      'Stress tests',
      'Consistency',
      'Final brand',
    ]) {
      assert.ok(markdown.includes(`## ${heading}`), `missing: ${heading}`);
    }
  });

  it('omits sections not yet derived', () => {
    const markdown = renderMarkdown(createInitialState(project));
    assert.ok(!markdown.includes('## Positioning'));
    assert.match(markdown, /Nothing derived yet/);
  });

  it('escapes pipes so a finding cannot break the stress-test table', () => {
    const state = completeState();
    state.stressTests[0]!.finding = 'reads as a | b';

    const row = renderMarkdown(state)
      .split('\n')
      .find((line) => line.includes('reads as a'))!;
    assert.match(row, /a \\\| b/);
    assert.equal(row.split(/(?<!\\)\|/).length - 1, 6);
  });
});
