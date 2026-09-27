#!/usr/bin/env node
/**
 * The `brandstate` command.
 *
 * Every subcommand operates on a run file, so a pipeline can be stopped,
 * inspected, edited, rolled back and resumed between invocations.
 */
import { BrandClient, RefusalError, SectionParseError } from './client.ts';
import type { Effort } from './client.ts';
import { DiscoverResultSchema } from './schemas.ts';
import { discover } from './discover.ts';
import type { DiscoverRequest } from './discover.ts';
import {
  DiscoveryIncompleteError,
  PositionInputError,
  VagueCategoryError,
  detectsAudienceNarrowing,
  position,
  validatePositionRequest,
} from './position.ts';
import { createDiscoverServer, listen } from './server.ts';
import { renderMarkdown } from './report.ts';
import { MissingDependencyError, STEPS, runStep } from './steps.ts';
import { isComplete, rollbackTo, runPipeline } from './pipeline.ts';
import type { StepRecord } from './pipeline.ts';
import {
  SECTION_ORDER,
  createInitialState,
  diffStates,
  nextSection,
  populatedSections,
  stableStringify,
  validateState,
} from './state.ts';
import { InvalidRunFileError, loadState, saveState } from './store.ts';
import type { BrandState, BrandStateSection, Project } from './types.ts';

const USAGE = `brandstate — build a brand by threading one BrandState through a pipeline of AI calls.

Usage
  brandstate run <idea>            Run the whole pipeline and save the result.
  brandstate step <section>        Run one step against a saved run.
  brandstate show                  Print a saved run as Markdown.
  brandstate status                Show which sections are derived.
  brandstate validate              Check a saved run against the schemas.
  brandstate rollback <section>    Discard a section and everything after it.
  brandstate diff <other.json>     Compare a saved run against another file.
  brandstate discover <idea>       Run DISCOVER alone and print the result.
  brandstate position <file>       Run POSITION against a discovery JSON file.
  brandstate serve                 Serve the DISCOVER and POSITION endpoints.

Options
  --run <path>        Run file. Default: runs/brand.json
  --type <text>       project.productType, for "run".
  --goal <text>       project.goal, for "run".
  --until <section>   Stop after this section, for "run".
  --model <id>        Default: claude-opus-5
  --effort <level>    low | medium | high | xhigh | max. Default: high
  --max-tokens <n>    Per-call output cap. Default: 16000
  --force             For "step": re-derive a section that is already populated.
  --md <path>         Also write the Markdown report to this path.
  --json              For "show": print the state as JSON instead of Markdown.
  --answers <text>    For "discover": answers to a previous call's questions.
  --prior <path>      For "discover": the discovery object those answers reply to.
  --competitors <list>  For "position": comma-separated known alternatives.
  --force             For "position": proceed despite unresolved open questions.
  --alternatives      For "position": also return the angles not chosen.
  --port <n>          For "serve". Default: 3000
  --host <name>       For "serve". Default: 127.0.0.1

Sections
  ${SECTION_ORDER.join(', ')}

Credentials resolve from ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, or an
\`ant auth login\` profile.`;

const EFFORTS: readonly Effort[] = ['low', 'medium', 'high', 'xhigh', 'max'];

type Args = {
  command: string | undefined;
  positionals: string[];
  flags: Map<string, string | true>;
};

function parseArgs(argv: string[]): Args {
  const positionals: string[] = [];
  const flags = new Map<string, string | true>();

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }
    const name = arg.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags.set(name, next);
      i++;
    } else {
      flags.set(name, true);
    }
  }

  return { command: positionals.shift(), positionals, flags };
}

function flagString(args: Args, name: string): string | undefined {
  const value = args.flags.get(name);
  return typeof value === 'string' ? value : undefined;
}

function runPath(args: Args): string {
  return flagString(args, 'run') ?? 'runs/brand.json';
}

function asSection(value: string | undefined, what: string): BrandStateSection {
  if (value === undefined) fail(`${what} is required. One of: ${SECTION_ORDER.join(', ')}`);
  if (!(SECTION_ORDER as readonly string[]).includes(value)) {
    fail(`Unknown section "${value}". One of: ${SECTION_ORDER.join(', ')}`);
  }
  return value as BrandStateSection;
}

function clientFrom(args: Args): BrandClient {
  const effort = flagString(args, 'effort');
  if (effort !== undefined && !(EFFORTS as readonly string[]).includes(effort)) {
    fail(`Unknown effort "${effort}". One of: ${EFFORTS.join(', ')}`);
  }

  const maxTokens = flagString(args, 'max-tokens');
  if (maxTokens !== undefined && !/^\d+$/.test(maxTokens)) {
    fail(`--max-tokens must be a positive integer, got "${maxTokens}".`);
  }

  return new BrandClient({
    model: flagString(args, 'model'),
    effort: effort as Effort | undefined,
    maxTokens: maxTokens === undefined ? undefined : Number(maxTokens),
  });
}

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function reportStep(record: StepRecord): void {
  const seconds = (record.durationMs / 1000).toFixed(1);
  const cached = record.usage.cacheReadTokens > 0 ? `, ${record.usage.cacheReadTokens} cached` : '';
  process.stderr.write(
    `  done in ${seconds}s (${record.usage.inputTokens} in${cached}, ${record.usage.outputTokens} out)\n`,
  );
}

async function commandRun(args: Args): Promise<void> {
  const idea = args.positionals.join(' ').trim();
  if (idea === '') fail('An idea is required: brandstate run "<idea>"');

  const project: Project = { idea };
  const productType = flagString(args, 'type');
  const goal = flagString(args, 'goal');
  if (productType !== undefined) project.productType = productType;
  if (goal !== undefined) project.goal = goal;

  const until = args.flags.has('until')
    ? asSection(flagString(args, 'until'), '--until')
    : undefined;

  const path = runPath(args);
  const result = await runPipeline(clientFrom(args), createInitialState(project), {
    ...(until ? { until } : {}),
    onStepStart: (_section, label) => process.stderr.write(`${label}...\n`),
    onStepFinish: reportStep,
  });

  process.stderr.write(
    `\nTotal: ${result.usage.inputTokens} input, ${result.usage.outputTokens} output, ` +
      `${result.usage.cacheReadTokens} read from cache.\n`,
  );
  if (result.usage.cacheReadTokens === 0 && result.steps.length > 1) {
    process.stderr.write(
      'Note: nothing was served from cache — the shared prompt prefix is likely below the ' +
        'model minimum cacheable length.\n',
    );
  }

  await persist(args, path, result.state);
}

async function commandStep(args: Args): Promise<void> {
  const section = asSection(args.positionals[0], 'A section');
  const path = runPath(args);
  let state = await loadState(path);

  if (populatedSections(state).includes(section) && !args.flags.has('force')) {
    fail(`${section} is already derived. Pass --force to re-derive it, or use rollback.`);
  }

  process.stderr.write(`${STEPS[section].label}...\n`);
  const startedAt = Date.now();
  const result = await runStep(clientFrom(args), state, section);
  state = result.state;
  reportStep({ section, label: STEPS[section].label, usage: result.usage, durationMs: Date.now() - startedAt });

  await persist(args, path, state);
}

async function commandShow(args: Args): Promise<void> {
  const state = await loadState(runPath(args));
  process.stdout.write(args.flags.has('json') ? `${stableStringify(state, 2)}\n` : renderMarkdown(state));
}

async function commandStatus(args: Args): Promise<void> {
  const path = runPath(args);
  const state = await loadState(path);
  const done = new Set(populatedSections(state));

  process.stdout.write(`${path}\n\n`);
  for (const section of SECTION_ORDER) {
    process.stdout.write(`  ${done.has(section) ? '[x]' : '[ ]'} ${section}\n`);
  }

  const next = nextSection(state);
  process.stdout.write(
    `\n${isComplete(state) ? 'Complete.' : `Next: ${next} (brandstate step ${next} --run ${path})`}\n`,
  );
}

async function commandValidate(args: Args): Promise<void> {
  const path = runPath(args);
  const result = validateState(await loadState(path));

  if (result.valid) {
    process.stdout.write(`${path} is valid.\n`);
    return;
  }
  for (const error of result.errors) {
    process.stderr.write(`${error.section}: ${error.message}\n`);
  }
  process.exit(1);
}

async function commandRollback(args: Args): Promise<void> {
  const section = asSection(args.positionals[0], 'A section');
  const path = runPath(args);
  const before = await loadState(path);
  const after = rollbackTo(before, section);

  const discarded = diffStates(before, after)
    .filter((entry) => entry.status !== 'unchanged')
    .map((entry) => entry.section);

  if (discarded.length === 0) {
    process.stdout.write(`Nothing to discard from ${section} onward.\n`);
    return;
  }

  await saveState(path, after);
  process.stdout.write(`Discarded: ${discarded.join(', ')}\nSaved ${path}\n`);
}

async function commandDiff(args: Args): Promise<void> {
  const otherPath = args.positionals[0];
  if (otherPath === undefined) fail('A file to compare against is required: brandstate diff <other.json>');

  const [before, after] = await Promise.all([loadState(runPath(args)), loadState(otherPath)]);
  for (const entry of diffStates(before, after)) {
    process.stdout.write(`  ${entry.status.padEnd(9)} ${entry.section}\n`);
  }
}

async function commandDiscover(args: Args): Promise<void> {
  const idea = args.positionals.join(' ').trim();
  if (idea === '') fail('An idea is required: brandstate discover "<idea>"');

  const request: DiscoverRequest = { idea };
  const priorPath = flagString(args, 'prior');
  const answers = flagString(args, 'answers');

  if (priorPath !== undefined) {
    const { readFile } = await import('node:fs/promises');
    request.priorDiscovery = DiscoverResultSchema.parse(JSON.parse(await readFile(priorPath, 'utf8')));
  }
  if (answers !== undefined) request.answers = answers;
  if (answers !== undefined && priorPath === undefined) {
    fail('--answers needs --prior: the answers reply to the questions in that discovery object.');
  }

  const result = await discover(clientFrom(args), request);
  process.stdout.write(`${stableStringify(result.value, 2)}\n`);

  const gaps = result.value.missingInformation.length;
  process.stderr.write(
    gaps === 0
      ? '\nNothing outstanding — discovery is sufficient.\n'
      : `\n${gaps} gap${gaps === 1 ? '' : 's'} outstanding. Answer the questions and pass this object back with --prior.\n`,
  );
}

async function commandPosition(args: Args): Promise<void> {
  const path = args.positionals[0];
  if (path === undefined) {
    fail('A discovery JSON file is required: brandstate position <discovery.json>');
  }

  const { readFile } = await import('node:fs/promises');
  const body = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;

  const competitors = flagString(args, 'competitors');
  if (competitors !== undefined) {
    body.knownCompetitors = competitors.split(',').map((name) => name.trim()).filter((name) => name !== '');
  }
  if (args.flags.has('force')) body.forceProceed = true;
  if (args.flags.has('alternatives')) body.includeAlternatives = true;

  const request = validatePositionRequest(body);
  const result = await position(clientFrom(args), request);

  process.stdout.write(`${stableStringify(result.value, 2)}\n`);

  if (detectsAudienceNarrowing(request.discovery.targetAudience, result.value.audience)) {
    process.stderr.write(
      '\nThe audience was sharpened from discovery. Check that rationale accounts for the narrowing.\n',
    );
  }
  const assumed = result.value.assumptionsUsed?.length ?? 0;
  if (assumed > 0) {
    process.stderr.write(`${assumed} discovery question${assumed === 1 ? '' : 's'} was assumed away.\n`);
  }
}

async function commandServe(args: Args): Promise<void> {
  const portFlag = flagString(args, 'port');
  if (portFlag !== undefined && !/^\d+$/.test(portFlag)) {
    fail(`--port must be a positive integer, got "${portFlag}".`);
  }

  const host = flagString(args, 'host') ?? '127.0.0.1';
  const server = createDiscoverServer({
    model: flagString(args, 'model'),
    effort: flagString(args, 'effort') as never,
  });

  const port = await listen(server, portFlag === undefined ? 3000 : Number(portFlag), host);
  process.stderr.write(
    `Listening on http://${host}:${port}\n` +
      '  POST /api/discover\n  POST /api/position\n  GET  /health\n',
  );
}

/** Saves the run, plus the Markdown report when `--md` was passed. */
async function persist(args: Args, path: string, state: BrandState): Promise<void> {
  await saveState(path, state);
  process.stderr.write(`Saved ${path}\n`);

  const markdownPath = flagString(args, 'md');
  if (markdownPath !== undefined) {
    const { mkdir, writeFile } = await import('node:fs/promises');
    const { dirname } = await import('node:path');
    await mkdir(dirname(markdownPath), { recursive: true });
    await writeFile(markdownPath, renderMarkdown(state), 'utf8');
    process.stderr.write(`Saved ${markdownPath}\n`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.command === undefined || args.command === 'help' || args.flags.has('help')) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }

  const commands: Record<string, (args: Args) => Promise<void>> = {
    run: commandRun,
    step: commandStep,
    show: commandShow,
    status: commandStatus,
    validate: commandValidate,
    rollback: commandRollback,
    diff: commandDiff,
    discover: commandDiscover,
    position: commandPosition,
    serve: commandServe,
  };

  const handler = commands[args.command];
  if (handler === undefined) fail(`Unknown command "${args.command}". Run \`brandstate help\`.`);

  await handler(args);
}

main().catch((error: unknown) => {
  // Each of these is an expected failure with something useful to say, so they
  // are reported as messages rather than stack traces.
  if (
    error instanceof MissingDependencyError ||
    error instanceof SectionParseError ||
    error instanceof RefusalError ||
    error instanceof InvalidRunFileError ||
    error instanceof PositionInputError ||
    error instanceof VagueCategoryError
  ) {
    fail(error.message);
  }
  if (error instanceof DiscoveryIncompleteError) {
    const questions = error.openQuestions.map((question) => `  - ${question}`).join('\n');
    fail(`${error.message}\n\nUnresolved:\n${questions}`);
  }
  if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
    fail(`No run file found. Start one with: brandstate run "<idea>"`);
  }
  throw error;
});
