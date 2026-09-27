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
      'Personality',
      'Naming',
      'Visual direction',
      'Voice',
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

  it('reports the severity counts and the finalization gate', () => {
    const markdown = renderMarkdown(completeState());

    assert.match(markdown, /0 critical, 1 high, 1 medium, 1 low\./);
    assert.match(markdown, /\*\*Finalization is blocked\*\*/);
  });

  it('says the brand can be finalized once nothing blocking is open', () => {
    const state = completeState();
    state.stressTests = state.stressTests.map((finding) =>
      finding.severity === 'high' ? { ...finding, status: 'acknowledged' as const } : finding,
    );

    const markdown = renderMarkdown(state);
    assert.match(markdown, /the brand can be finalized/);
    assert.doesNotMatch(markdown, /\*\*Finalization is blocked\*\*/);
  });

  it('orders findings by severity, so what blocks comes first', () => {
    const markdown = renderMarkdown(completeState());
    const headings = markdown
      .split('\n')
      .filter((line) => line.startsWith('### '))
      .filter((line) => /critical|high|medium|low/.test(line));

    assert.match(headings[0]!, /^### high/);
    assert.match(headings[headings.length - 1]!, /^### low/);
  });

  it('marks a finding that was acknowledged rather than fixed', () => {
    const state = completeState();
    state.stressTests[0] = { ...state.stressTests[0]!, status: 'acknowledged' };

    assert.match(renderMarkdown(state), /_\(acknowledged\)_/);
  });
});
