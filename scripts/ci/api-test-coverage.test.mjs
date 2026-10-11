import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const workflow = readFileSync(new URL('../../.github/workflows/cloudpainter-ci.yml', import.meta.url), 'utf8');
const databaseStep = 'Run database tests against the disposable PostgreSQL service';
const guardStep = 'Guard executable API database coverage';
const suites = ['test:image-access', 'test:palettes', 'test:settings'];
const disposableDatabaseUrl = 'postgresql://postgres:ci-test-password@127.0.0.1:5432/cloudpainter_test';
const portableStep = 'Run portable unit and mocked-provider suites';
// Independent executable coverage contract: do not derive expectations from the
// workflow under test (that would accept omitted or substituted commands).
const portableChecks = [
  ['api-outline', '@workspace/api-server', 'test:outline'],
  ['api-image-upscale', '@workspace/api-server', 'test:image-upscale'],
  ['api-logo', '@workspace/api-server', 'test:logo-api'],
  ['poe-adapter', '@workspace/integrations-openai-ai-server', 'test:poe'],
  ['cloudpainter-image-dimensions', '@workspace/cloudpainter', 'test:image-dimensions'],
  ['cloudpainter-outline', '@workspace/cloudpainter', 'test:outline'],
  ['cloudpainter-outline-ui', '@workspace/cloudpainter', 'test:outline-ui'],
  ['cloudpainter-stroke-renderer', '@workspace/cloudpainter', 'test:stroke-renderer'],
  ['cloudpainter-layer-clipboard', '@workspace/cloudpainter', 'test:layer-clipboard'],
  ['cloudpainter-drawing-tools', '@workspace/cloudpainter', 'test:drawing-tools'],
  ['cloudpainter-drawing-colors', '@workspace/cloudpainter', 'test:drawing-colors'],
  ['cloudpainter-palettes', '@workspace/cloudpainter', 'test:palettes'],
  ['cloudpainter-logo-ui', '@workspace/cloudpainter', 'test:logo-ui'],
  ['cloudpainter-upscale-ui', '@workspace/cloudpainter', 'test:upscale-ui'],
];

function portableCommand([, packageName, suite]) {
  return `--filter ${packageName} run ${suite}`;
}

function portableScript(source) {
  const body = stepBody(source, portableStep);
  const match = body.match(/^        run: \|\n((?:          [^\n]*\n|\n)+)$/m);
  assert.ok(match, 'Expected only the portable step inline shell script');
  const script = match[1].replace(/^          /gm, '');
  // Admit only this finite, builtin-only shell shape and stubbed pnpm calls.
  // A workflow edit cannot introduce real hooks/network commands into a guard.
  const statements = new Set([
    'set +e', 'failed=0', 'failed=1', 'run_check() {', 'label="$1"', 'shift',
    "printf '\\n=== %s ===\\n' \"$label\"", '"$@"', 'status=$?', 'status=0',
    'if [ "$status" -ne 0 ]; then',
    "printf 'FAILED (%s): exit %s\\n' \"$label\" \"$status\"",
    'else', "printf 'PASSED: %s\\n' \"$label\"", 'fi', '}',
    'exit "$failed"', 'exit 0',
  ]);
  for (const line of script.split('\n').map(line => line.trim())) {
    assert.ok(!line || line.startsWith('#') || statements.has(line)
      || /^run_check [a-z0-9-]+ pnpm --filter @workspace\/[a-z0-9-]+ run test:[a-z0-9-]+$/.test(line),
    `Unsupported portable fixture statement: ${line}`);
  }
  return script;
}

function runPortableStage(source, failingCheck) {
  const script = portableScript(source);
  const bash = (process.env.PATH ?? '').split(':').map(path => join(path, 'bash')).find(existsSync);
  assert.ok(bash, 'Expected a local Bash executable');
  const directory = mkdtempSync(join(tmpdir(), 'portable-ci-coverage-'));
  try {
    writeFileSync(join(directory, 'pnpm'), `#!/bin/sh
printf '%s\\n' "$*" >> "$CALLS_FILE"
if [ "$#" -ne 4 ] || [ "$1" != "--filter" ] || [ "$3" != "run" ]; then exit 98; fi
if [ "$*" = "$FAILING_CALL" ]; then exit 23; fi
exit 0
`, { mode: 0o700 });
    const result = spawnSync(bash, ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', script], {
      cwd: directory,
      // Only the stub is on PATH. No credentials or caller startup settings.
      env: {
        PATH: directory,
        CALLS_FILE: join(directory, 'calls'),
        FAILING_CALL: failingCheck ? portableCommand(failingCheck) : '',
      },
      encoding: 'utf8',
      timeout: 5000,
      killSignal: 'SIGKILL',
      maxBuffer: 64 * 1024,
    });
    assert.ifError(result.error);
    assert.equal(result.signal, null, 'Portable fixture must complete, not be killed');
    const calls = readFileSync(join(directory, 'calls'), 'utf8').trim().split('\n');
    assert.deepEqual(calls, portableChecks.map(portableCommand),
      'Effective portable suite selection must run every exact package/suite once, including siblings after a failure');
    assert.equal(result.status, failingCheck ? 1 : 0,
      'The portable stage must fail if any selected suite fails');
    const reports = result.stdout.split('\n').filter(line => /^(PASSED:|FAILED \()/.test(line));
    assert.deepEqual(reports, portableChecks.map(check => check === failingCheck
      ? `FAILED (${check[0]}): exit 23` : `PASSED: ${check[0]}`),
    'Portable stage must preserve each command status and label');
    return result;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function mutatePortableStage(before, after) {
  const body = stepBody(workflow, portableStep);
  assert.equal(body.split(before).length, 2, 'Mutation must target exactly one portable statement');
  return workflow.replace(body, body.replace(before, after));
}

// Deliberately supports only this workflow's existing step indentation and run
// formats. Fail on a changed shape rather than mistaking comments/docs for code.
function stepBody(source, name) {
  const marker = `      - name: ${name}\n`;
  assert.equal(source.split(marker).length, 2, `Expected exactly one ${name} step`);
  return source.split(marker)[1].split(/(?=^      - |^  [\w-]+:)/m)[0];
}

function databaseScript(source) {
  const body = stepBody(source, databaseStep);
  const environment = body.match(/^        env:\n((?:          [^\n]*\n)+)(?=        run:)/m);
  assert.ok(environment, 'Expected the database step to declare its disposable environment');
  assert.equal(environment[1], `          DATABASE_URL: ${disposableDatabaseUrl}\n`,
    'Database tests must target only the disposable PostgreSQL service URL');
  const match = body.match(/^        run: \|\n((?:          [^\n]*\n|\n)+)$/m);
  assert.ok(match, 'Expected the database step to end with its inline shell script');
  return match[1].replace(/^          /gm, '');
}

function runDatabaseStage(source, failingSuite = '') {
  // Validate the step-scoped connection boundary before creating/running stubs.
  // The URL is inspected as text only; it is never resolved or used to connect.
  const script = databaseScript(source);
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
    const result = spawnSync('bash', ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', script], {
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

for (const [label, target] of [
  ['shared database URL', 'postgresql://fixture-user:fixture-password@shared-db.invalid:5432/shared'],
  ['secret-backed database URL', '${{ secrets.DATABASE_URL }}'],
]) {
  test(`replacing the disposable target with a ${label} is rejected`, { timeout: 10000 }, () => {
    const body = stepBody(workflow, databaseStep);
    const mutatedBody = body.replace(
      `          DATABASE_URL: ${disposableDatabaseUrl}\n`,
      `          DATABASE_URL: ${target}\n`,
    );
    assert.notEqual(mutatedBody, body, 'Connection fixture must replace the database step URL');
    const mutated = workflow.replace(body, mutatedBody);
    assert.throws(() => runDatabaseStage(mutated),
      /Database tests must target only the disposable PostgreSQL service URL/);
  });
}

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

test('the executable portable stage selects all unit and mocked-provider suites', { timeout: 10000 }, () => {
  runPortableStage(workflow);
});

for (const check of [portableChecks[0], portableChecks.at(-1)]) {
  test(`${check[0]} failure fails the portable stage after executing every sibling`, { timeout: 10000 }, () => {
    runPortableStage(workflow, check);
  });

  for (const [label, before, after] of [
    ['swallowed command status', 'status=$?', 'status=0'],
    ['discarded failure aggregation', 'failed=1', 'failed=0'],
    ['forced exit zero', 'exit "$failed"', 'exit 0'],
  ]) {
    test(`${label} is rejected for ${check[0]}`, { timeout: 10000 }, () => {
      assert.throws(() => runPortableStage(mutatePortableStage(before, after), check),
        /portable stage must fail/);
    });
  }
}

for (const [label, replacement] of [
  ['comment-only suite mention', '# run_check poe-adapter pnpm --filter @workspace/integrations-openai-ai-server run test:poe'],
  ['wrong package', 'run_check poe-adapter pnpm --filter @workspace/api-server run test:poe'],
  ['wrong suite', 'run_check poe-adapter pnpm --filter @workspace/integrations-openai-ai-server run test:outline'],
  ['duplicate suite', 'run_check poe-adapter pnpm --filter @workspace/integrations-openai-ai-server run test:poe\n          run_check poe-adapter pnpm --filter @workspace/integrations-openai-ai-server run test:poe'],
]) {
  test(`portable ${label} is rejected by executable selection`, { timeout: 10000 }, () => {
    const mutated = mutatePortableStage(
      'run_check poe-adapter pnpm --filter @workspace/integrations-openai-ai-server run test:poe',
      replacement,
    );
    assert.throws(() => runPortableStage(mutated), /Effective portable suite selection/);
  });
}

test('portable fixture rejects unapproved executable statements before spawning', { timeout: 10000 }, () => {
  const mutated = mutatePortableStage('set +e', 'set +e\n          curl https://provider.invalid');
  assert.throws(() => runPortableStage(mutated), /Unsupported portable fixture statement/);
});
