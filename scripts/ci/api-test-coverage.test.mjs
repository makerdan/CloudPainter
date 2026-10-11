import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const workflow = readFileSync(new URL('../../.github/workflows/cloudpainter-ci.yml', import.meta.url), 'utf8');
const databaseStep = 'Run database tests against the disposable PostgreSQL service';
const guardStep = 'Guard executable API database coverage';
const suites = ['test:image-access', 'test:palettes', 'test:settings'];

// Deliberately supports only this workflow's existing step indentation and run
// formats. Fail on a changed shape rather than mistaking comments/docs for code.
function stepBody(source, name) {
  const marker = `      - name: ${name}\n`;
  assert.equal(source.split(marker).length, 2, `Expected exactly one ${name} step`);
  return source.split(marker)[1].split(/(?=^      - |^  [\w-]+:)/m)[0];
}

function databaseScript(source) {
  const body = stepBody(source, databaseStep);
  const match = body.match(/^        run: \|\n((?:          [^\n]*\n|\n)+)$/m);
  assert.ok(match, 'Expected the database step to end with its inline shell script');
  return match[1].replace(/^          /gm, '');
}

function runDatabaseStage(source, failingSuite = '') {
  const directory = mkdtempSync(join(tmpdir(), 'api-ci-coverage-'));
  try {
    // No pnpm, database, credentials, provider or real package hook is invoked.
    writeFileSync(join(directory, 'pnpm'), `#!/bin/sh
printf '%s\\n' "$*" >> "$CALLS_FILE"
if [ "$1" != "--filter" ] || [ "$2" != "@workspace/api-server" ] || [ "$3" != "run" ] || [ "$#" -ne 4 ]; then
  exit 98
fi
if [ "$4" = "$FAILING_SUITE" ]; then exit 23; fi
exit 0
`, { mode: 0o700 });
    const result = spawnSync('bash', ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', databaseScript(source)], {
      cwd: directory,
      // Do not inherit database, Clerk or provider environment variables.
      env: {
        PATH: `${directory}:${process.env.PATH}`,
        CALLS_FILE: join(directory, 'calls'),
        FAILING_SUITE: failingSuite,
      },
      encoding: 'utf8',
      timeout: 5000,
      killSignal: 'SIGKILL',
      maxBuffer: 64 * 1024,
    });
    assert.ifError(result.error);
    assert.equal(result.signal, null, 'Database fixture must complete, not be killed');
    const calls = readFileSync(join(directory, 'calls'), 'utf8').trim().split('\n');
    assert.deepEqual(calls, suites.map(suite => `--filter @workspace/api-server run ${suite}`),
      'Effective API suite selection must include image-access, palettes and settings exactly once');
    assert.equal(result.status, failingSuite ? 1 : 0,
      'The database stage must fail if any selected suite fails');
    if (failingSuite) {
      assert.match(result.stdout, new RegExp(`FAILED \\(${failingSuite}\\): exit 23`));
    }
    return result;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('the existing validation job selects the portable coverage guard', { timeout: 10000 }, () => {
  const validation = workflow.split('  validation:\n')[1]?.split('  ci-required:\n')[0];
  assert.ok(validation, 'Expected the existing validation job');
  assert.equal(stepBody(validation, guardStep).trim(),
    'run: node --test scripts/ci/api-test-coverage.test.mjs');
});

test('the executable database stage selects all three API suites', { timeout: 10000 }, () => {
  runDatabaseStage(workflow);
});

for (const suite of suites) {
  test(`${suite} failure makes the database stage fail after running its siblings`, { timeout: 10000 }, () => {
    runDatabaseStage(workflow, suite);
  });
}

test('omitting settings is rejected even when a shell comment still names it', { timeout: 10000 }, () => {
  const omitted = workflow.replace(
    'for check in test:image-access test:palettes test:settings; do',
    '# test:settings remains mentioned, but is not selected\n          for check in test:image-access test:palettes; do',
  );
  assert.notEqual(omitted, workflow, 'Omission fixture must change the executable loop');
  assert.throws(() => runDatabaseStage(omitted), /Effective API suite selection/);
});

test('a swallowed settings failure is rejected', { timeout: 10000 }, () => {
  // Replace only within the database step: other stages also exit "$failed".
  const body = stepBody(workflow, databaseStep);
  const mutated = workflow.replace(body, body.replace('exit "$failed"', 'exit 0'));
  assert.notEqual(mutated, workflow, 'Failure fixture must replace the database exit');
  assert.throws(() => runDatabaseStage(mutated, 'test:settings'), /database stage must fail/);
});
