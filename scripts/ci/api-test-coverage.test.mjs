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
    'set +e', 'failed=0', 'failed=1', 'failed=$((1 - failed))',
    'run_check() {', 'label="$1"', 'shift',
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

function runPortableStage(source, failingChecks = []) {
  const failingCommands = new Set(failingChecks.map(portableCommand));
  const script = portableScript(source);
  const bash = (process.env.PATH ?? '').split(':').map(path => join(path, 'bash')).find(existsSync);
  assert.ok(bash, 'Expected a local Bash executable');
  const directory = mkdtempSync(join(tmpdir(), 'portable-ci-coverage-'));
  try {
    writeFileSync(join(directory, 'pnpm'), `#!/bin/sh
printf '%s\\n' "$*" >> "$CALLS_FILE"
if [ "$#" -ne 4 ] || [ "$1" != "--filter" ] || [ "$3" != "run" ]; then exit 98; fi
# Delimit complete commands so shared suite names cannot fail other packages.
case "$FAILING_CALLS" in *"|$*|"*) exit 23 ;; esac
exit 0
`, { mode: 0o700 });
    const result = spawnSync(bash, ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', script], {
      cwd: directory,
      // Only the stub is on PATH. No credentials or caller startup settings.
      env: {
        PATH: directory,
        CALLS_FILE: join(directory, 'calls'),
        FAILING_CALLS: `|${[...failingCommands].join('|')}|`,
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
    const reports = result.stdout.split('\n').filter(line => /^(PASSED:|FAILED \()/.test(line));
    assert.deepEqual(reports, portableChecks.map(check => failingCommands.has(portableCommand(check))
      ? `FAILED (${check[0]}): exit 23` : `PASSED: ${check[0]}`),
    'Portable stage must preserve each command status and label');
    assert.equal(result.status, failingCommands.size ? 1 : 0,
      'The portable stage must fail if any selected suite fails');
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

function assertDisposableService(source) {
  // Inspect only validation's existing postgres service, never another job or
  // a comment. This intentionally fails closed when its YAML shape changes.
  const validation = source.match(/^  validation:\n((?:    [^\n]*\n|\n)+)/m)?.[1];
  assert.ok(validation, 'Expected the existing validation job');
  const marker = '    services:\n      postgres:\n';
  assert.equal(validation.split(marker).length, 2,
    'Expected exactly one disposable PostgreSQL service in validation');
  const service = validation.split(marker)[1].split(/(?=^    \S|^      \S)/m)[0];
  assert.match(service, /^        image: postgres:[^\s]+\n/m,
    'Expected the disposable PostgreSQL service image');
  const target = new URL(disposableDatabaseUrl); // Text parsing only; no connection.
  const environment = service.match(/^        env:\n((?:          [^\n]*\n)+)/m)?.[1];
  assert.equal(environment, [
    `          POSTGRES_DB: ${target.pathname.slice(1)}`,
    `          POSTGRES_USER: ${target.username}`,
    `          POSTGRES_PASSWORD: ${target.password}`,
    '',
  ].join('\n'), 'PostgreSQL service environment must match the disposable database URL');
  const ports = service.match(/^        ports:\n((?:          [^\n]*\n)+)/m)?.[1];
  assert.equal(ports, `          - ${target.port}:5432\n`,
    'PostgreSQL service ports must map the disposable URL port to PostgreSQL port 5432');
}

function databaseScript(source) {
  assertDisposableService(source);
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
  // Simulate only this fixture's GitHub substitution with inert text, never a
  // secret lookup. Passing the raw expression to Bash could instead produce a
  // bad-substitution error and miss the effective connection-boundary assertion.
  const script = databaseScript(source).replaceAll(
    '${{ secrets.DATABASE_URL }}', 'offline-secret-database-target',
  );
  assert.ok(!script.includes('${{'), 'Unsupported GitHub expression in offline database fixture');
  const directory = mkdtempSync(join(tmpdir(), 'api-ci-coverage-'));
  try {
    // No pnpm, database, credentials, provider or real package hook is invoked.
    writeFileSync(join(directory, 'pnpm'), `#!/bin/sh
printf '%s\\n' "$*" >> "$CALLS_FILE"
printf '%s\\t%s\\n' "$4" "\${DATABASE_URL-}" >> "$CONNECTIONS_FILE"
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
        CONNECTIONS_FILE: join(directory, 'connections'),
        DATABASE_URL: disposableDatabaseUrl,
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
    const connections = readFileSync(join(directory, 'connections'), 'utf8').trim().split('\n');
    assert.deepEqual(connections, suites.map(suite => `${suite}\t${disposableDatabaseUrl}`),
      'Effective API suite DATABASE_URL must target only the disposable PostgreSQL service URL');
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

test('the unchanged PostgreSQL service agrees with the disposable URL as text', { timeout: 10000 }, () => {
  assertDisposableService(workflow);
});

for (const [label, original, replacement, expected] of [
  ['missing service', '      postgres:\n', '      removed-postgres:\n',
    /Expected exactly one disposable PostgreSQL service in validation/],
  ['missing image', '        image: postgres:16.10-bookworm\n', '',
    /Expected the disposable PostgreSQL service image/],
  ['missing service environment', '        env:\n', '        removed-env:\n',
    /PostgreSQL service environment must match/],
  ...[
    ['database name', 'POSTGRES_DB', 'cloudpainter_test', 'fixture_database'],
    ['user', 'POSTGRES_USER', 'postgres', 'fixture_user'],
    ['password', 'POSTGRES_PASSWORD', 'ci-test-password', 'fixture_password'],
  ].flatMap(([label, key, value, mismatched]) => [
    [`missing ${label}`, `          ${key}: ${value}\n`, '',
      /PostgreSQL service environment must match/],
    [`mismatched ${label}`, `          ${key}: ${value}\n`, `          ${key}: ${mismatched}\n`,
      /PostgreSQL service environment must match/],
  ]),
  ['missing ports block', '        ports:\n', '        removed-ports:\n',
    /PostgreSQL service ports must map/],
  ['missing port mapping', '          - 5432:5432\n', '',
    /PostgreSQL service ports must map/],
  ['mismatched host port', '          - 5432:5432\n', '          - 55432:5432\n',
    /PostgreSQL service ports must map/],
  ['mismatched container port', '          - 5432:5432\n', '          - 5432:55432\n',
    /PostgreSQL service ports must map/],
]) {
  test(`PostgreSQL service ${label} is rejected by its intended assertion`, { timeout: 10000 }, () => {
    // Replace only the first occurrence (the service), retaining the step URL.
    const mutated = workflow.replace(original, replacement);
    assert.notEqual(mutated, workflow, 'Service fixture must change the workflow text');
    assert.equal(stepBody(mutated, databaseStep), stepBody(workflow, databaseStep),
      'Service fixture must leave the database step unchanged');
    // No shell stubs or real commands run in these negative text fixtures.
    assert.throws(() => databaseScript(mutated), expected);
  });
}

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

for (const [label, target] of [
  ['shared database URL', 'postgresql://fixture-user:fixture-password@shared-db.invalid:5432/shared'],
  ['secret-backed database URL', '${{ secrets.DATABASE_URL }}'],
]) {
  for (const [scope, rewrite] of [
    ['shell assignment', body => body.replace(
      '          failed=0\n', `          failed=0\n          DATABASE_URL="${target}"\n`,
    )],
    ['exported shell assignment', body => body.replace(
      '          failed=0\n', `          failed=0\n          export DATABASE_URL="${target}"\n`,
    )],
    ['command-local assignment', body => body.replace(
      '            pnpm --filter', `            DATABASE_URL="${target}" pnpm --filter`,
    )],
    ['command-local env override', body => body.replace(
      '            pnpm --filter', `            env DATABASE_URL="${target}" pnpm --filter`,
    )],
  ]) {
    test(`${scope} to a ${label} is rejected at the effective boundary`, { timeout: 10000 }, () => {
      const body = stepBody(workflow, databaseStep);
      const mutatedBody = rewrite(body);
      assert.notEqual(mutatedBody, body, 'Override fixture must change executable shell commands');
      const mutated = workflow.replace(body, mutatedBody);
      // The original env assertion still passes; only the stub-observed target
      // may reject this mutation, not suite selection or an incidental shell exit.
      databaseScript(mutated);
      assert.throws(() => runDatabaseStage(mutated), {
        code: 'ERR_ASSERTION',
        message: /^Effective API suite DATABASE_URL must target only the disposable PostgreSQL service URL/,
      });
    });
  }
}

for (const redirectedSuite of suites) {
  test(`redirecting only ${redirectedSuite} is rejected at the effective boundary`, { timeout: 10000 }, () => {
    const sharedTarget = 'postgresql://fixture-user:fixture-password@shared-db.invalid:5432/shared';
    const body = stepBody(workflow, databaseStep);
    const command = '            pnpm --filter @workspace/api-server run "$check"\n';
    assert.equal(body.split(command).length, 2, 'Fixture must target exactly one database command');
    const mutatedBody = body.replace(command, [
      `            if [ "$check" = "${redirectedSuite}" ]; then`,
      `              export DATABASE_URL="${sharedTarget}"`,
      '            else',
      `              export DATABASE_URL="${disposableDatabaseUrl}"`,
      '            fi',
      command.trimEnd(),
      '',
    ].join('\n'));
    assert.notEqual(mutatedBody, body, 'Single-suite fixture must change executable shell commands');
    const mutated = workflow.replace(body, mutatedBody);
    assert.equal(
      mutatedBody.split('        run: |\n')[0],
      body.split('        run: |\n')[0],
      'Single-suite fixture must leave the step environment unchanged',
    );
    databaseScript(mutated); // The declared disposable environment still passes.
    // runDatabaseStage checks all three exact calls before its connection check.
    // Inspect that assertion's observations to prove only the selected suite
    // redirected, including disposable siblings after an early redirect.
    assert.throws(() => runDatabaseStage(mutated), error => {
      assert.equal(error.code, 'ERR_ASSERTION');
      assert.match(error.message,
        /^Effective API suite DATABASE_URL must target only the disposable PostgreSQL service URL/);
      assert.deepEqual(error.expected, suites.map(suite => `${suite}\t${disposableDatabaseUrl}`));
      assert.deepEqual(error.actual, suites.map(suite =>
        `${suite}\t${suite === redirectedSuite ? sharedTarget : disposableDatabaseUrl}`));
      return true;
    });
  });
}

for (const [label, statement] of [
  ['unset DATABASE_URL', 'unset DATABASE_URL'],
  ['empty DATABASE_URL', 'DATABASE_URL=""'],
]) {
  test(`${label} after the correct step environment is rejected at the effective boundary`, { timeout: 10000 }, () => {
    const body = stepBody(workflow, databaseStep);
    const mutatedBody = body.replace(
      '          failed=0\n', `          failed=0\n          ${statement}\n`,
    );
    assert.notEqual(mutatedBody, body, 'Missing-target fixture must change executable shell commands');
    const mutated = workflow.replace(body, mutatedBody);
    // The correct step env still passes. All three stubs must run; rejection
    // must come from their observed connection, not selection or shell failure.
    databaseScript(mutated);
    assert.throws(() => runDatabaseStage(mutated), {
      code: 'ERR_ASSERTION',
      message: /^Effective API suite DATABASE_URL must target only the disposable PostgreSQL service URL/,
      actual: [
        'test:image-access\t',
        'test:palettes\t',
        // The fixture reader trims trailing whitespace from the final record.
        'test:settings',
      ],
    });
  });
}

test('a comment naming another target does not redirect the effective connection', { timeout: 10000 }, () => {
  const body = stepBody(workflow, databaseStep);
  const mutated = workflow.replace(body, body.replace(
    '          failed=0\n',
    '          failed=0\n          # DATABASE_URL="postgresql://shared-db.invalid/shared"\n',
  ));
  assert.notEqual(mutated, workflow, 'Comment fixture must change the database script');
  runDatabaseStage(mutated);
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

test('the executable portable stage selects all unit and mocked-provider suites', { timeout: 10000 }, () => {
  runPortableStage(workflow);
});

for (const check of [portableChecks[0], portableChecks.at(-1)]) {
  test(`${check[0]} failure fails the portable stage after executing every sibling`, { timeout: 10000 }, () => {
    runPortableStage(workflow, [check]);
  });

  for (const [label, before, after] of [
    ['swallowed command status', 'status=$?', 'status=0'],
    ['discarded failure aggregation', 'failed=1', 'failed=0'],
    ['forced exit zero', 'exit "$failed"', 'exit 0'],
  ]) {
    test(`${label} is rejected for ${check[0]}`, { timeout: 10000 }, () => {
      assert.throws(() => runPortableStage(mutatePortableStage(before, after), [check]),
        label === 'swallowed command status'
          ? /Portable stage must preserve each command status and label/
          : /portable stage must fail/);
    });
  }
}

for (const [label, failingChecks] of [
  ['first and last fail together', [portableChecks[0], portableChecks.at(-1)]],
  ['two failures precede successful siblings', [portableChecks[0], portableChecks[1]]],
]) {
  test(`portable ${label} preserves every command and report and exits nonzero`, { timeout: 10000 }, () => {
    runPortableStage(workflow, failingChecks);
  });

  test(`portable toggle-style aggregation is rejected when ${label}`, { timeout: 10000 }, () => {
    // A parity accumulator passes single-failure cases but returns zero for two.
    // Admit this exact builtin mutation so rejection proves the exit assertion,
    // after verifying every exact sibling command and both failure reports.
    const mutated = mutatePortableStage('failed=1', 'failed=$((1 - failed))');
    assert.throws(() => runPortableStage(mutated, failingChecks),
      /portable stage must fail/);
  });
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
