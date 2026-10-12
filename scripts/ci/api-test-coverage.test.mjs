import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import test from 'node:test';

const workflow = readFileSync(new URL('../../.github/workflows/cloudpainter-ci.yml', import.meta.url), 'utf8');
const databaseStep = 'Run database tests against the disposable PostgreSQL service';
const guardStep = 'Guard executable API database coverage';
const suites = ['test:image-access', 'test:palettes', 'test:settings'];
const disposableDatabaseUrl = 'postgresql://postgres:ci-test-password@127.0.0.1:5432/cloudpainter_test';
const databaseChecks = [
  ['test:image-access', 'tests/image-access.test.ts'],
  ['test:palettes', 'src/routes/palettes.test.ts'],
  ['test:settings', 'src/routes/settings.test.ts'],
];
const apiManifestPath = 'artifacts/api-server/package.json';
const apiManifest = JSON.parse(readFileSync(new URL(`../../${apiManifestPath}`, import.meta.url), 'utf8'));
const databasePackageDirectory = apiManifestPath.slice(0, -'/package.json'.length);
const disposablePostgresImage = 'postgres:16.10-bookworm';
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

// Read the real manifests, not scripts invented by the pnpm shell stub. These
// fixed workspace paths are inspected only; no command or package hook is run.
const portableManifestPaths = [
  'artifacts/api-server/package.json',
  'lib/integrations-openai-ai-server/package.json',
  'artifacts/cloudpainter/package.json',
];
const portableManifests = portableManifestPaths.map(path =>
  JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')));
const portablePackageDirectories = new Map(portableManifests.map((manifest, index) =>
  [manifest.name, portableManifestPaths[index].slice(0, -'/package.json'.length)]));

function isRepositoryFile(path) {
  try {
    return statSync(new URL(`../../${path}`, import.meta.url)).isFile();
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return false;
    throw error;
  }
}

// Literal, unquoted package-relative filenames only. This is not shell
// resolution, module resolution, glob expansion or Vitest test discovery.
function literalScriptFiles(command, context) {
  const unsupported = `${context}: unsupported portable package command shape: ${command}`;
  assert.match(command, /^[A-Za-z0-9_./= -]+$/, unsupported);
  const tokens = command.trim().split(/ +/);
  const targets = [];
  const filename = token => /^(?:\.\/)?(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-][A-Za-z0-9_.-]*\.(?:ts|tsx|js|jsx|mjs|cjs|json)$/.test(token);
  if (tokens[0] === 'node' || tokens[0] === 'tsx') {
    let hasTest = false;
    let hasTargets = false;
    const flags = new Set();
    for (let index = 1; index < tokens.length; index++) {
      const token = tokens[index];
      if (filename(token)) {
        hasTargets = true;
        targets.push(token);
        continue;
      }
      assert.ok(!hasTargets, unsupported); // Options must precede targets.
      const flag = token.split('=')[0];
      assert.ok(!flags.has(flag), unsupported);
      flags.add(flag);
      if (token === '--test') {
        hasTest = true;
      } else if (token === '--experimental-strip-types') {
        assert.equal(tokens[0], 'node', unsupported);
      } else if (token === '--import') {
        assert.ok(tokens[0] === 'node' && tokens[++index] === 'tsx', unsupported);
      } else {
        assert.match(token, /^--test-timeout=[1-9][0-9]*$/, unsupported);
        assert.ok(Number(token.slice('--test-timeout='.length)) <= 2147483647, unsupported);
      }
    }
    assert.ok(hasTest && targets.length > 0, unsupported);
  } else {
    assert.ok(tokens[0] === 'vitest' && tokens[1] === 'run'
      && tokens[2] === '--config' && filename(tokens[3]), unsupported);
    targets.push(tokens[3]);
    for (const token of tokens.slice(4)) {
      assert.ok(filename(token), unsupported);
      targets.push(token);
    }
  }
  return targets;
}

function assertPortablePackageScripts(source, manifests, fileAvailable = isRepositoryFile) {
  const selected = [...portableScript(source).matchAll(
    /^run_check ([a-z0-9-]+) pnpm --filter (@workspace\/[a-z0-9-]+) run (test:[a-z0-9-]+)$/gm,
  )].map(match => match.slice(1));
  assert.deepEqual(selected, portableChecks, 'Manifest check must inspect every exact selected portable command');
  for (const [label, packageName, suite] of selected) {
    const packages = manifests.filter(manifest => manifest.name === packageName);
    assert.ok(packages.length === 1, `${label}: expected one manifest for ${packageName}`);
    const scripts = packages[0].scripts;
    assert.ok(scripts && Object.hasOwn(scripts, suite)
      && typeof scripts[suite] === 'string' && scripts[suite].trim().length > 0,
    `${label}: ${packageName} run ${suite} must have a nonempty package script`);
    const context = `${label}: ${packageName} run ${suite}`;
    const directory = portablePackageDirectories.get(packageName);
    assert.ok(directory, `${context}: expected a fixed package directory`);
    for (const target of literalScriptFiles(scripts[suite], context)) {
      assert.ok(fileAvailable(`${directory}/${target}`),
        `${context}: referenced file must exist: ${target}`);
    }
  }
}

// The three database suites are an independent exact contract. Inspect their
// manifest command strings and literal targets; never invoke a manifest script.
function assertDatabasePackageScripts(manifest, fileAvailable = isRepositoryFile) {
  assert.equal(manifest.name, '@workspace/api-server',
    'Database checks must come from the API server manifest');
  assert.ok(manifest.scripts && typeof manifest.scripts === 'object',
    'Expected API server package scripts');
  for (const [suite, target] of databaseChecks) {
    const context = `@workspace/api-server run ${suite}`;
    const command = manifest.scripts[suite];
    assert.ok(typeof command === 'string' && command.trim().length > 0,
      `${context} must have a nonempty package script`);
    assert.equal(command, `tsx --test ${target}`,
      `${context} must retain its authorized test runner and literal target`);
    assert.deepEqual(literalScriptFiles(command, context), [target],
      `${context} must select only its authorized literal target`);
    assert.ok(fileAvailable(`${databasePackageDirectory}/${target}`),
      `${context}: referenced file must exist: ${target}`);
  }
}

const databaseFixtureTargets = new Set([
  disposableDatabaseUrl,
  'postgresql://fixture-user:fixture-password@shared-db.invalid:5432/shared',
  '${{ secrets.DATABASE_URL }}',
  'offline-secret-database-target',
  '',
]);

function assertDatabaseShellAdmission(script) {
  const admitted = new Set([
    'set +e',
    'failed=0',
    "printf '\\n=== api-server %s ===\\n' \"$check\"",
    'pnpm --filter @workspace/api-server run "$check"',
    'status=$?',
    'if [ "$status" -ne 0 ]; then',
    "printf 'FAILED (%s): exit %s\\n' \"$check\" \"$status\"",
    'failed=1',
    'else',
    "printf 'PASSED: %s\\n' \"$check\"",
    'fi',
    'done',
    'exit "$failed"',
    'unset DATABASE_URL',
    'DATABASE_URL=""',
    'exit 0',
  ]);

  for (const line of script.split('\n').map(value => value.trim())) {
    if (!line || line.startsWith('#') || admitted.has(line)) continue;
    const loop = line.match(/^for check in ([a-z:-]+(?: [a-z:-]+)*); do$/);
    if (loop) {
      const selected = loop[1].split(' ');
      if (selected.length > 0
        && selected.every(suite => suites.includes(suite))
        && new Set(selected).size === selected.length
        && selected.join(' ') === suites.filter(suite => selected.includes(suite)).join(' ')) {
        continue;
      }
    }
    const assignment = line.match(/^(?:export )?DATABASE_URL="([^"\n]*)"$/);
    if (assignment && databaseFixtureTargets.has(assignment[1])) continue;
    const localPnpm = line.match(/^(?:DATABASE_URL|env DATABASE_URL)="([^"\n]*)" pnpm --filter @workspace\/api-server run "\$check"$/);
    if (localPnpm && databaseFixtureTargets.has(localPnpm[1])) continue;
    const branch = line.match(/^(?:if \[ "\$check" = "(test:image-access|test:palettes|test:settings)" \]; then|export DATABASE_URL="([^"\n]*)")$/);
    if (branch && (!branch[2] || databaseFixtureTargets.has(branch[2]))) continue;
    assert.fail(`Unsupported database shell statement: ${line}`);
  }
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
  const failureCodes = new Map(failingChecks.map((failure) => {
    const check = Array.isArray(failure) ? failure : failure.check;
    const code = Array.isArray(failure) ? 23 : failure.code;
    assert.ok(portableChecks.some((candidate) => candidate === check
      || (candidate[0] === check?.[0] && candidate[1] === check?.[1] && candidate[2] === check?.[2])),
    'Failure injection must target an independently selected portable suite');
    assert.ok(Number.isInteger(code) && code >= 1 && code <= 255,
      'Failure injection must use a distinct valid nonzero exit code');
    return [portableCommand(check), code];
  }));
  assert.equal(failureCodes.size, failingChecks.length, 'A suite may be assigned only one injected exit code');
  const script = portableScript(source);
  const bash = (process.env.PATH ?? '').split(':').map(path => join(path, 'bash')).find(existsSync);
  assert.ok(bash, 'Expected a local Bash executable');
  const directory = mkdtempSync(join(tmpdir(), 'portable-ci-coverage-'));
  try {
    const injectedFailures = [...failureCodes.entries()];
    const failureBranches = injectedFailures.map((_, index) =>
      `if [ "$*" = "$FAILURE_COMMAND_${index + 1}" ]; then exit "$FAILURE_STATUS_${index + 1}"; fi`).join('\n');
    writeFileSync(join(directory, 'pnpm'), `#!/bin/sh
printf '%s\\n' "$*" >> "$CALLS_FILE"
if [ "$#" -ne 4 ] || [ "$1" != "--filter" ] || [ "$3" != "run" ]; then exit 98; fi
${failureBranches}
exit 0
`, { mode: 0o700 });
    const failureEnvironment = Object.fromEntries(injectedFailures.flatMap(([command, code], index) => [
      [`FAILURE_COMMAND_${index + 1}`, command],
      [`FAILURE_STATUS_${index + 1}`, String(code)],
    ]));
    const result = spawnSync(bash, ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', script], {
      cwd: directory,
      // Only the stub is on PATH. No credentials or caller startup settings.
      env: {
        PATH: directory,
        CALLS_FILE: join(directory, 'calls'),
        ...failureEnvironment,
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
    assert.deepEqual(reports, portableChecks.map(check => failureCodes.has(portableCommand(check))
      ? `FAILED (${check[0]}): exit ${failureCodes.get(portableCommand(check))}` : `PASSED: ${check[0]}`),
    'Portable stage must preserve each command status and label');
    assert.equal(result.status, failureCodes.size ? 1 : 0,
      'The portable stage must fail if any selected suite fails');
    return result;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function processIsRunning(pid) {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    const state = stat.slice(stat.lastIndexOf(')') + 1).trimStart()[0];
    return state !== 'Z' && state !== 'X';
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ESRCH') return false;
    throw error;
  }
}

async function waitUntil(predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await delay(10);
  }
  return predicate();
}

function signalOwnedGroup(groupId, signal) {
  assert.ok(Number.isInteger(groupId) && groupId > 1 && groupId !== process.pid,
    'Only the isolated fixture process group may be signaled');
  try {
    process.kill(-groupId, signal);
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}

async function runHangingPortableStage(source) {
  const script = portableScript(source);
  const bash = (process.env.PATH ?? '').split(':').map(path => join(path, 'bash')).find(existsSync);
  assert.ok(bash, 'Expected a local Bash executable');
  const directory = mkdtempSync(join(tmpdir(), 'portable-ci-timeout-'));
  const callsFile = join(directory, 'calls');
  const pidsFile = join(directory, 'owned-pids');
  writeFileSync(join(directory, 'pnpm'), `#!/bin/sh
printf '%s\\n' "$*" >> "$CALLS_FILE"
printf '%s\\n' "$$" > "$OWNED_PIDS_FILE"
sleep 30 &
child=$!
printf '%s\\n' "$child" >> "$OWNED_PIDS_FILE"
trap 'kill -TERM "$child" 2>/dev/null || true; wait "$child" 2>/dev/null || true; exit 143' TERM INT
wait "$child"
`, { mode: 0o700 });

  let child;
  let closed;
  let output = '';
  let errorOutput = '';
  let timedOut = false;
  let cleanupComplete = false;
  const processIds = [];
  try {
    child = spawn(bash, ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', script], {
      cwd: directory,
      // A fresh session gives this synthetic fixture an exact, private process
      // group; timeout cleanup never signals the caller or workspace services.
      detached: true,
      env: {
        PATH: `${directory}:${process.env.PATH ?? ''}`,
        CALLS_FILE: callsFile,
        OWNED_PIDS_FILE: pidsFile,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    assert.ok(child.pid && child.pid !== process.pid, 'The timeout fixture must have its own process identity');
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { errorOutput += chunk; });
    closed = new Promise(resolve => child.once('close', (code, signal) => resolve({ code, signal })));

    const stubStarted = await waitUntil(() => existsSync(pidsFile), 2_000);
    assert.ok(stubStarted, 'The owned shell stub must start before its timeout is exercised');
    const ready = await waitUntil(() => {
      const pids = readFileSync(pidsFile, 'utf8').trim().split('\n');
      if (pids.length !== 2 || pids.some(pid => !/^[1-9][0-9]*$/.test(pid))) return false;
      processIds.splice(0, processIds.length, ...pids.map(Number));
      return true;
    }, 2_000);
    assert.ok(ready, 'The fixture must record its shell and child process identities');
    assert.equal((await Promise.race([closed, delay(150).then(() => null)])), null,
      'The deliberate fixture must remain stuck until the supervisor deadline');

    timedOut = true;
    signalOwnedGroup(child.pid, 'SIGTERM');
    const graceful = await Promise.race([closed, delay(250).then(() => null)]);
    if (graceful === null) signalOwnedGroup(child.pid, 'SIGKILL');
    const result = await Promise.race([closed, delay(2_000).then(() => null)]);
    assert.ok(result, 'The owned shell tree must terminate within the bounded cleanup period');
    const stopped = await waitUntil(() => processIds.every(pid => !processIsRunning(pid)), 1_000);
    assert.ok(stopped, `Owned fixture descendants must stop: ${processIds.join(', ')}`);
    cleanupComplete = true;
    const calls = readFileSync(callsFile, 'utf8').trim().split('\n');
    return { result, timedOut, output, errorOutput, processIds, calls };
  } finally {
    if (child?.pid && !cleanupComplete) {
      signalOwnedGroup(child.pid, 'SIGKILL');
      const stoppedChild = closed && await Promise.race([closed, delay(2_000).then(() => null)]);
      assert.ok(stoppedChild, 'The fixture process must be reaped after forced cleanup');
      const ownedProcesses = [child.pid, ...processIds];
      const stoppedTree = await waitUntil(() => ownedProcesses.every(pid => !processIsRunning(pid)), 1_000);
      assert.ok(stoppedTree, `No owned fixture process may remain: ${ownedProcesses.join(', ')}`);
    }
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

function jobBody(source, name) {
  const marker = `  ${name}:\n`;
  assert.equal(source.split(marker).length, 2, `Expected exactly one ${name} job`);
  const jobsStart = source.indexOf('jobs:\n');
  const jobStart = source.indexOf(marker);
  assert.ok(jobsStart >= 0 && jobStart > jobsStart, `Expected ${name} under jobs`);
  const contentStart = jobStart + marker.length;
  const nextJob = source.slice(contentStart).search(/^  [A-Za-z0-9_-]+:\n/m);
  return source.slice(contentStart, nextJob < 0 ? source.length : contentStart + nextJob);
}

function assertDisposableService(source) {
  // Inspect only validation's existing postgres service, never another job or
  // a comment. This intentionally fails closed when its YAML shape changes.
  const validation = jobBody(source, 'validation');
  const marker = '    services:\n      postgres:\n';
  assert.equal(validation.split(marker).length, 2,
    'Expected exactly one disposable PostgreSQL service in validation');
  const service = validation.split(marker)[1].split(/(?=^    \S|^      \S)/m)[0];
  assert.equal(service.match(/^        image: ([^\s]+)\n/m)?.[1], disposablePostgresImage,
    `PostgreSQL service image must remain ${disposablePostgresImage}`);
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
  const options = service.match(/^        options: >-\n((?:          [^\n]*\n)+)/m)?.[1];
  const healthCommands = options?.split('\n').filter(line => line.trimStart().startsWith('--health-cmd'));
  assert.deepEqual(healthCommands, [
    `          --health-cmd "pg_isready -U ${target.username} -d ${target.pathname.slice(1)}"`,
  ], 'PostgreSQL health command must use pg_isready with the disposable URL user and database');
  const readinessLimits = options?.split('\n')
    .filter(line => /^--health-(?:interval|timeout|retries)\b/.test(line.trimStart()))
    .map(line => line.trim());
  assert.deepEqual(readinessLimits, [
    '--health-interval 5s',
    '--health-timeout 5s',
    '--health-retries 12',
  ], 'PostgreSQL readiness limits must remain bounded at interval 5s, timeout 5s, retries 12');
}

function databaseScript(source) {
  assertDisposableService(source);
  const marker = `      - name: ${databaseStep}\n`;
  assert.equal(source.split(marker).length, 2,
    'Expected exactly one database-test step in the complete workflow');
  const validation = jobBody(source, 'validation');
  const body = stepBody(validation, databaseStep);
  const environment = body.match(/^        env:\n((?:          [^\n]*\n)+)(?=        run:)/m);
  assert.ok(environment, 'Expected the database step to declare its disposable environment');
  assert.equal(environment[1], `          DATABASE_URL: ${disposableDatabaseUrl}\n`,
    'Database tests must target only the disposable PostgreSQL service URL');
  const match = body.match(/^        run: \|\n((?:          [^\n]*\n|\n)+)$/m);
  assert.ok(match, 'Expected the database step to end with its inline shell script');
  const script = match[1].replace(/^          /gm, '');
  assertDatabaseShellAdmission(script);
  return script;
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
    writeFileSync(join(directory, 'env'), `#!/bin/sh
case "$1" in
  DATABASE_URL=*) DATABASE_URL=\${1#DATABASE_URL=} ;;
  *) exit 97 ;;
esac
export DATABASE_URL
shift
if [ "$#" -ne 5 ] || [ "$1" != "pnpm" ] || [ "$2" != "--filter" ] \
  || [ "$3" != "@workspace/api-server" ] || [ "$4" != "run" ]; then exit 97; fi
exec "$@"
`, { mode: 0o700 });
    const bash = (process.env.PATH ?? '').split(':').map(path => join(path, 'bash')).find(existsSync);
    assert.ok(bash, 'Expected a local Bash executable');
    const result = spawnSync(bash, ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', script], {
      cwd: directory,
      // Do not inherit database, Clerk or provider environment variables.
      env: {
        // Only the purpose-built stubs are executable by the fixture shell.
        PATH: directory,
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

test('database package manifests retain the authorized test commands and literal files', { timeout: 10000 }, () => {
  assertDatabasePackageScripts(apiManifest);
  const inspected = [];
  assertDatabasePackageScripts(apiManifest, path => {
    inspected.push(path);
    return true;
  });
  assert.deepEqual(inspected, databaseChecks.map(([, target]) => `${databasePackageDirectory}/${target}`));
});

for (const [suite] of databaseChecks) {
  for (const command of [
    'node --test tests/anything.test.ts',
    'tsx --test tests/anything.test.ts && touch /tmp/database-command-must-not-run',
    'pnpm run test:settings',
    'tsx --test "$TEST_FILE"',
  ]) {
    test(`${suite} rejects an unexpected manifest command without executing it: ${command}`,
      { timeout: 10000 }, () => {
        const fixture = structuredClone(apiManifest);
        fixture.scripts[suite] = command;
        let fileLookups = 0;
        assert.throws(() => assertDatabasePackageScripts(fixture, () => {
          fileLookups++;
          return true;
        }), /must retain its authorized test runner and literal target/);
        assert.equal(fileLookups, databaseChecks.findIndex(([candidate]) => candidate === suite),
          'Reject the command before inspecting its file or any later suite');
      });
  }
}

test('the unchanged PostgreSQL service agrees with the disposable URL as text', { timeout: 10000 }, () => {
  assertDisposableService(workflow);
});

function databaseStepBlock(source) {
  const validation = jobBody(source, 'validation');
  return `      - name: ${databaseStep}\n${stepBody(validation, databaseStep)}`;
}

function addDatabaseStepDecoyJob(source, block, placement) {
  const decoy = `  fixture-database-decoy:\n    runs-on: ubuntu-24.04\n    steps:\n${block}`;
  if (placement === 'before') {
    assert.equal(source.split('  validation:\n').length, 2, 'Expected one validation job');
    return source.replace('  validation:\n', `${decoy}  validation:\n`);
  }
  assert.equal(source.split('  ci-required:\n').length, 2, 'Expected one aggregate job');
  return source.replace('  ci-required:\n', `${decoy}  ci-required:\n`);
}

for (const placement of ['before', 'after']) {
  test(`database workflow job scope rejects a borrowed step in a decoy job ${placement} validation`,
    { timeout: 10000 }, () => {
      const block = databaseStepBlock(workflow);
      const withoutValidationStep = workflow.replace(block, '');
      assert.notEqual(withoutValidationStep, workflow, 'Fixture must remove the validation database step');
      const mutated = addDatabaseStepDecoyJob(withoutValidationStep, block, placement);
      assert.throws(() => databaseScript(mutated),
        /Expected exactly one Run database tests against the disposable PostgreSQL service step/);
    });

  test(`database workflow job scope rejects an extra decoy step ${placement} validation`, { timeout: 10000 }, () => {
    const mutated = addDatabaseStepDecoyJob(workflow, databaseStepBlock(workflow), placement);
    assert.throws(() => databaseScript(mutated),
      /Expected exactly one database-test step in the complete workflow/);
  });

  test(`database workflow job scope accepts unrelated job steps ${placement} validation`, { timeout: 10000 }, () => {
    const decoy = `  fixture-unrelated:\n    runs-on: ubuntu-24.04\n    steps:\n      - name: Unrelated fixture step\n        run: echo inert\n`;
    const mutated = placement === 'before'
      ? workflow.replace('  validation:\n', `${decoy}  validation:\n`)
      : workflow.replace('  ci-required:\n', `${decoy}  ci-required:\n`);
    assert.equal(databaseScript(mutated), databaseScript(workflow),
      'An unrelated job must not affect the intended database step');
  });
}

const validationBlock = `  validation:\n${jobBody(workflow, 'validation')}`;
for (const invalidFirst of [false, true]) {
  test(`duplicate validation jobs are rejected before service inspection (${invalidFirst ? 'invalid first' : 'valid first'})`,
    { timeout: 10000 }, () => {
      const invalid = validationBlock.replace(
        'POSTGRES_DB: cloudpainter_test',
        'POSTGRES_DB: fixture_wrong_database',
      );
      assert.notEqual(invalid, validationBlock, 'Duplicate-job fixture must contain a mismatched service');
      const blocks = invalidFirst ? [invalid, validationBlock] : [validationBlock, invalid];
      const withoutValidation = workflow.replace(validationBlock, '');
      const source = withoutValidation.replace('  ci-required:\n', `${blocks.join('')}  ci-required:\n`);
      assert.throws(() => databaseScript(source), /Expected exactly one validation job/);
    });
}

test('database command admission rejects an injected executable before shell execution', { timeout: 10000 }, () => {
  const markerPath = join(tmpdir(), `database-command-must-not-run-${process.pid}`);
  rmSync(markerPath, { force: true });
  const body = stepBody(jobBody(workflow, 'validation'), databaseStep);
  const original = '            pnpm --filter @workspace/api-server run "$check"\n';
  assert.equal(body.split(original).length, 2, 'Fixture must target one database suite command');
  const mutated = workflow.replace(body, body.replace(
    original,
    `            touch ${markerPath}\n${original}`,
  ));
  assert.throws(() => databaseScript(mutated), /Unsupported database shell statement/);
  assert.equal(existsSync(markerPath), false, 'Rejected workflow command must not execute');
});

for (const [label, replacement] of [
  ['missing command', ''],
  ['missing user flag and value', '          --health-cmd "pg_isready -d cloudpainter_test"\n'],
  ['missing user value', '          --health-cmd "pg_isready -U -d cloudpainter_test"\n'],
  ['mismatched user', '          --health-cmd "pg_isready -U fixture_user -d cloudpainter_test"\n'],
  ['missing database flag and value', '          --health-cmd "pg_isready -U postgres"\n'],
  ['missing database value', '          --health-cmd "pg_isready -U postgres -d"\n'],
  ['mismatched database', '          --health-cmd "pg_isready -U postgres -d fixture_database"\n'],
]) {
  test(`PostgreSQL health ${label} is rejected by its intended assertion`, { timeout: 10000 }, () => {
    const original = '          --health-cmd "pg_isready -U postgres -d cloudpainter_test"\n';
    assert.equal(workflow.split(original).length, 2,
      'Health fixture must target exactly one existing command');
    const mutated = workflow.replace(original, replacement);
    assert.notEqual(mutated, workflow, 'Health fixture must change the workflow text');
    assert.equal(stepBody(mutated, databaseStep), stepBody(workflow, databaseStep),
      'Health fixture must leave the database step unchanged');
    // Text parsing only: never spawn pg_isready, PostgreSQL or shell stubs.
    assert.throws(() => databaseScript(mutated), {
      code: 'ERR_ASSERTION',
      message: /^PostgreSQL health command must use pg_isready with the disposable URL user and database/,
    });
  });
}

test('PostgreSQL service image must match the agreed version', { timeout: 10000 }, () => {
  const original = `        image: ${disposablePostgresImage}\n`;
  const mutated = workflow.replace(original, '        image: postgres:17.0-bookworm\n');
  assert.notEqual(mutated, workflow, 'Version fixture must change exactly the service image');
  assert.equal(stepBody(mutated, databaseStep), stepBody(workflow, databaseStep),
    'Version fixture must leave the database step unchanged');
  assert.throws(() => databaseScript(mutated), {
    code: 'ERR_ASSERTION',
    message: /^PostgreSQL service image must remain postgres:16\.10-bookworm/,
  });
});

test('PostgreSQL service image must reject a mutable tag', { timeout: 10000 }, () => {
  const original = `        image: ${disposablePostgresImage}\n`;
  const mutated = workflow.replace(original, '        image: postgres:16\n');
  assert.notEqual(mutated, workflow, 'Mutable-tag fixture must change exactly the service image');
  assert.equal(stepBody(mutated, databaseStep), stepBody(workflow, databaseStep),
    'Mutable-tag fixture must leave the database step unchanged');
  assert.throws(() => databaseScript(mutated), {
    code: 'ERR_ASSERTION',
    message: /^PostgreSQL service image must remain postgres:16\.10-bookworm/,
  });
});

for (const [setting, originalValue, replacement] of [
  ['interval', '5s', null],
  ['interval', '5s', '0s'],
  ['interval', '5s', '10s'],
  ['interval', '5s', '999999999s'],
  ['timeout', '5s', null],
  ['timeout', '5s', '0s'],
  ['timeout', '5s', '10s'],
  ['timeout', '5s', '999999999s'],
  ['retries', '12', null],
  ['retries', '12', '0'],
  ['retries', '12', '10'],
  ['retries', '12', '999999999'],
]) {
  test(`PostgreSQL readiness ${setting} ${replacement === null ? 'is required' : `rejects ${replacement}`}`,
    { timeout: 10000 }, () => {
      const original = `          --health-${setting} ${originalValue}\n`;
      const changed = replacement === null ? '' : `          --health-${setting} ${replacement}\n`;
      assert.equal(workflow.split(original).length, 2,
        `Readiness fixture must target exactly one health ${setting}`);
      const mutated = workflow.replace(original, changed);
      assert.notEqual(mutated, workflow, 'Readiness fixture must change the workflow text');
      assert.equal(stepBody(mutated, databaseStep), stepBody(workflow, databaseStep),
        'Readiness fixture must leave the database step unchanged');
      // Text parsing only: this must reject before any service or command is started.
      assert.throws(() => databaseScript(mutated), {
        code: 'ERR_ASSERTION',
        message: /^PostgreSQL readiness limits must remain bounded at interval 5s, timeout 5s, retries 12/,
      });
    });
}

// Independent synthetic decoy, not copied from the service under test. Keep
// these fixtures text-only: no YAML discovery, shell stubs or connections.
const decoyPostgresService = [
  '    services:',
  '      postgres:',
  '        image: postgres:16.10-bookworm',
  '        env:',
  '          POSTGRES_DB: cloudpainter_test',
  '          POSTGRES_USER: postgres',
  '          POSTGRES_PASSWORD: ci-test-password',
  '        ports:',
  '          - 5432:5432',
  '        options: >-',
  '          --health-cmd "pg_isready -U postgres -d cloudpainter_test"',
  '          --health-interval 5s',
  '          --health-timeout 5s',
  '          --health-retries 12',
  '',
].join('\n');
const decoyJob = `  fixture-decoy:\n    runs-on: ubuntu-24.04\n${decoyPostgresService}`;

function serviceScopeFixture(state, decoy, placement) {
  const marker = '    services:\n      postgres:\n';
  assert.equal(workflow.split(marker).length, 2, 'Expected one original service stanza');
  const originalService = marker + workflow.split(marker)[1].split('    steps:\n')[0];
  assert.ok(originalService.endsWith('\n'), 'Expected the service to precede steps');
  const replacement = state === 'missing' ? '' : state === 'mismatched'
    ? originalService.replace('POSTGRES_DB: cloudpainter_test', 'POSTGRES_DB: fixture_wrong_database')
    : originalService;
  let source = workflow.replace(originalService, replacement);
  if (placement === 'before') {
    assert.equal(source.split('  validation:\n').length, 2);
    source = source.replace('  validation:\n', `${decoy}  validation:\n`);
  } else {
    assert.equal(source.split('  ci-required:\n').length, 2);
    source = source.replace('  ci-required:\n', `${decoy}  ci-required:\n`);
  }
  assert.notEqual(source, workflow, 'Scoping fixture must change the workflow text');
  assert.equal(stepBody(source, databaseStep), stepBody(workflow, databaseStep),
    'Scoping fixture must leave the database step unchanged');
  return source;
}

for (const state of ['missing', 'mismatched']) {
  const expected = state === 'missing'
    ? /Expected exactly one disposable PostgreSQL service in validation/
    : /PostgreSQL service environment must match the disposable database URL/;
  for (const placement of ['before', 'after']) {
    test(`PostgreSQL service job scope: ${state} validation service rejects valid decoy job ${placement}`,
      { timeout: 10000 }, () => {
        const source = serviceScopeFixture(state, decoyJob, placement);
        assert.ok(source.includes(decoyJob), 'The other job must retain its valid service');
        assert.throws(() => databaseScript(source), expected);
      });
  }
  test(`PostgreSQL service job scope: ${state} validation service rejects comment-only decoy`,
    { timeout: 10000 }, () => {
      // Indented comments stay inside validation, but contain no YAML service.
      const comment = decoyPostgresService.trimEnd().split('\n')
        .map(line => `    # ${line.trimStart()}\n`).join('');
      const source = serviceScopeFixture(state, comment, 'before')
        .replace(`${comment}  validation:\n`, `  validation:\n${comment}`);
      assert.ok(source.includes(comment), 'The complete valid service must remain only a comment');
      assert.throws(() => databaseScript(source), expected);
    });
}

for (const placement of ['before', 'after']) {
  test(`PostgreSQL service job scope: unchanged validation accepts unrelated job ${placement}`,
    { timeout: 10000 }, () => {
      const unrelated = decoyJob.replace('POSTGRES_DB: cloudpainter_test', 'POSTGRES_DB: fixture_other_database')
        .replace('- 5432:5432', '- 55432:5432');
      const source = serviceScopeFixture('unchanged', unrelated, placement);
      assert.equal(databaseScript(source), databaseScript(workflow),
        'Unrelated job service settings must not affect the unchanged validation service');
    });
}

test('PostgreSQL service job scope: unchanged validation accepts unrelated sibling service',
  { timeout: 10000 }, () => {
    const sibling = decoyPostgresService.replace('    services:\n', '')
      .replace('      postgres:\n', '      fixture-other-postgres:\n')
      .replace('POSTGRES_DB: cloudpainter_test', 'POSTGRES_DB: fixture_other_database')
      .replace('- 5432:5432', '- 55432:5432');
    const source = workflow.replace('    steps:\n', `${sibling}    steps:\n`);
    assert.notEqual(source, workflow, 'Sibling fixture must add a service');
    assert.equal(stepBody(source, databaseStep), stepBody(workflow, databaseStep));
    assert.equal(databaseScript(source), databaseScript(workflow),
      'An unrelated sibling service must not affect the unchanged validation service');
  });

for (const [label, original, replacement, expected] of [
  ['missing service', '      postgres:\n', '      removed-postgres:\n',
    /Expected exactly one disposable PostgreSQL service in validation/],
  ['missing image', '        image: postgres:16.10-bookworm\n', '',
    /PostgreSQL service image must remain postgres:16\.10-bookworm/],
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

for (const clearedSuite of suites) {
  for (const [label, clear] of [
    ['unset', 'unset DATABASE_URL'],
    ['empty', 'DATABASE_URL=""'],
  ]) {
    test(`clearing DATABASE_URL for only ${clearedSuite} is rejected while siblings retain the disposable target`,
      { timeout: 10000 }, () => {
        const body = stepBody(workflow, databaseStep);
        const command = '            pnpm --filter @workspace/api-server run "$check"\n';
        assert.equal(body.split(command).length, 2, 'Fixture must target one database command');
        const mutation = [
          `            if [ "$check" = "${clearedSuite}" ]; then`,
          `              ${clear}`,
          '            else',
          `              export DATABASE_URL="${disposableDatabaseUrl}"`,
          '            fi',
          command.trimEnd(),
          '',
        ].join('\n');
        const mutated = workflow.replace(body, body.replace(command, mutation));
        databaseScript(mutated);
        assert.throws(() => runDatabaseStage(mutated), error => {
          assert.equal(error.code, 'ERR_ASSERTION');
          assert.match(error.message,
            /^Effective API suite DATABASE_URL must target only the disposable PostgreSQL service URL/);
          assert.deepEqual(error.expected, suites.map(suite => `${suite}\t${disposableDatabaseUrl}`));
          const expectedObserved = suites.map(suite =>
            `${suite}\t${suite === clearedSuite ? '' : disposableDatabaseUrl}`).join('\n').trim().split('\n');
          assert.deepEqual(error.actual, expectedObserved);
          return true;
        });
      });
  }
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

test('every selected portable suite has a command in its real package manifest', { timeout: 10000 }, () => {
  assertPortablePackageScripts(workflow, portableManifests);
});

// Independent literal-reference expectations, not extracted from the scripts
// under test. Config-only Vitest commands intentionally cover only their config.
const portableTargetFiles = [
  ['src/routes/outline.test.ts'],
  ['tests/image-upscale.test.ts'],
  ['tests/logo-images.test.ts'],
  ['tests/poe-image.test.ts'],
  ['src/lib/imageDimensions.test.ts'],
  ['src/lib/outlinePrivacy.test.ts'],
  ['vitest.outline.config.ts'],
  ['src/lib/strokeRenderer.test.ts'],
  ['src/lib/layerClipboard.test.ts'],
  ['src/lib/drawingTools.test.ts'],
  ['src/lib/drawingColors.test.ts'],
  ['src/lib/palettePersistence.test.ts'],
  ['vitest.logo.config.ts'],
  ['vitest.logo.config.ts', 'src/components/PoeUpscaleExport.test.tsx'],
];
assert.equal(portableTargetFiles.length, portableChecks.length);
const portableFileInventory = new Set(portableChecks.flatMap(([, packageName], index) =>
  portableTargetFiles[index].map(target => `${portablePackageDirectories.get(packageName)}/${target}`)));

test('literal references match the independent contract and resolve to regular files in their own packages',
  { timeout: 10000 }, () => {
    for (const [index, [label, packageName, suite]] of portableChecks.entries()) {
      const manifest = portableManifests.find(entry => entry.name === packageName);
      assert.deepEqual(literalScriptFiles(manifest.scripts[suite], label), portableTargetFiles[index]);
    }
    const inspected = [];
    assertPortablePackageScripts(workflow, portableManifests, path => {
      inspected.push(path);
      return isRepositoryFile(path);
    });
    assert.deepEqual(inspected, portableChecks.flatMap(([, packageName], index) =>
      portableTargetFiles[index].map(target => `${portablePackageDirectories.get(packageName)}/${target}`)));
    assertPortablePackageScripts(workflow, portableManifests, path => portableFileInventory.has(path));
  });

for (const [index, [label, packageName, suite]] of portableChecks.entries()) {
  for (const target of portableTargetFiles[index]) {
    test(`${label} stale reference to ${target} is rejected; matching renamed file is accepted`,
      { timeout: 10000 }, () => {
        const manifests = structuredClone(portableManifests);
        const manifest = manifests.find(entry => entry.name === packageName);
        const renamed = target.replace(/(\.[^.]+)$/, '-renamed$1');
        const original = manifest.scripts[suite];
        assert.equal(original.split(target).length, 2, 'Fixture must target exactly one literal');
        manifest.scripts[suite] = original.replace(target, renamed);
        assert.notEqual(manifest.scripts[suite], original);
        assert.throws(() => assertPortablePackageScripts(workflow, manifests,
          path => portableFileInventory.has(path)), {
          code: 'ERR_ASSERTION',
          message: `${label}: ${packageName} run ${suite}: referenced file must exist: ${renamed}`,
        });
        const files = new Set(portableFileInventory);
        files.add(`${portablePackageDirectories.get(packageName)}/${renamed}`);
        assertPortablePackageScripts(workflow, manifests, path => files.has(path));
      });
  }
}

for (const path of portableFileInventory) {
  for (const mutation of ['missing', 'renamed']) {
    test(`${mutation} referenced file ${path} is rejected without filesystem writes`,
      { timeout: 10000 }, () => {
        const files = new Set(portableFileInventory);
        files.delete(path);
        if (mutation === 'renamed') files.add(path.replace(/(\.[^.]+)$/, '-renamed$1'));
        // A shared config fails at its first selected user, not a later one.
        const index = portableChecks.findIndex(([, packageName], index) =>
          portableTargetFiles[index].some(target =>
            `${portablePackageDirectories.get(packageName)}/${target}` === path));
        const [label, packageName, suite] = portableChecks[index];
        const target = path.slice(portablePackageDirectories.get(packageName).length + 1);
        assert.throws(() => assertPortablePackageScripts(workflow, portableManifests,
          candidate => files.has(candidate)), {
          code: 'ERR_ASSERTION',
          message: `${label}: ${packageName} run ${suite}: referenced file must exist: ${target}`,
        });
        files.add(path);
        assertPortablePackageScripts(workflow, portableManifests, candidate => files.has(candidate));
      });
  }
}

for (const command of [
  'node --test', 'tsx --test', 'node src/routes/outline.test.ts',
  'pnpm run test:outline', 'FOO=1 tsx --test src/routes/outline.test.ts',
  'tsx --test src/routes/*.test.ts', 'node --test "$TEST_FILE"',
  'node --test tests/a.test.ts && node --test tests/b.test.ts',
  'node --test tests/a.test.ts; echo ok', 'node --test tests/a.test.ts | cat',
  'node --test tests/a.test.ts # comment', 'node --test ../outside.test.ts',
  'node --test /tmp/outside.test.ts', 'node --test "tests/a.test.ts"',
  'node --test --unknown tests/a.test.ts', 'node --import other --test tests/a.test.ts',
  'node --test --test-timeout=0 tests/a.test.ts',
  'node --test --test-timeout=2147483648 tests/a.test.ts',
  'node --test tests/a.test.ts --experimental-strip-types',
  'node --test --test tests/a.test.ts',
  'vitest run', 'vitest run --config', 'vitest run --config missing',
  'vitest run --config vitest.config.ts --watch',
]) {
  test(`unsupported package command fails closed: ${command}`, { timeout: 10000 }, () => {
    const manifests = structuredClone(portableManifests);
    manifests.find(entry => entry.name === portableChecks[0][1]).scripts[portableChecks[0][2]] = command;
    assert.throws(() => assertPortablePackageScripts(workflow, manifests, () => {
      assert.fail('Unsupported shape must be rejected before checking file availability');
    }), {
      code: 'ERR_ASSERTION',
      message: /^api-outline: @workspace\/api-server run test:outline: unsupported portable package command shape:/,
    });
  });
}

test('supported literal commands retain multiple targets, config targets and package-relative dot prefixes',
  { timeout: 10000 }, () => {
    assert.deepEqual(literalScriptFiles('node --import tsx --test ./tests/a.test.ts tests/b.test.ts', 'fixture'),
      ['./tests/a.test.ts', 'tests/b.test.ts']);
    assert.deepEqual(literalScriptFiles('vitest run --config ./vitest.config.ts tests/a.test.tsx tests/b.test.tsx', 'fixture'),
      ['./vitest.config.ts', 'tests/a.test.tsx', 'tests/b.test.tsx']);
    assert.equal(isRepositoryFile('artifacts/cloudpainter/src'), false, 'Directories are not file targets');
    assert.equal(isRepositoryFile('artifacts/cloudpainter/src/fixture-missing.test.ts'), false);
  });

for (const [label, packageName, suite] of portableChecks) {
  for (const [mutation, rewrite] of [
    ['missing', scripts => { delete scripts[suite]; }],
    ['renamed', scripts => {
      scripts[`${suite}-renamed`] = scripts[suite];
      delete scripts[suite];
    }],
    ['empty', scripts => { scripts[suite] = ''; }],
    ['whitespace-only', scripts => { scripts[suite] = ' \t\n '; }],
    ['non-string', scripts => { scripts[suite] = ['node', '--test']; }],
  ]) {
    test(`${label} ${mutation} package script is rejected without executing it`, { timeout: 10000 }, () => {
      const manifests = structuredClone(portableManifests);
      const manifest = manifests.find(entry => entry.name === packageName);
      assert.ok(manifest && Object.hasOwn(manifest.scripts, suite), 'Mutation must target a real script');
      rewrite(manifest.scripts);
      assert.notDeepEqual(manifests, portableManifests, 'Mutation must change only the in-memory fixture');
      assert.throws(() => assertPortablePackageScripts(workflow, manifests), {
        code: 'ERR_ASSERTION',
        message: `${label}: ${packageName} run ${suite} must have a nonempty package script`,
      });
    });
  }
}

for (const manifest of portableManifests) {
  test(`${manifest.name} renamed package cannot borrow scripts from another manifest`, { timeout: 10000 }, () => {
    const manifests = structuredClone(portableManifests);
    manifests.find(entry => entry.name === manifest.name).name += '-renamed';
    const [label] = portableChecks.find(([, packageName]) => packageName === manifest.name);
    assert.throws(() => assertPortablePackageScripts(workflow, manifests), {
      code: 'ERR_ASSERTION',
      message: `${label}: expected one manifest for ${manifest.name}`,
    });
  });
}

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

test('portable stage preserves distinct original suite exit codes and still fails', { timeout: 10000 }, () => {
  runPortableStage(workflow, [
    { check: portableChecks[0], code: 17 },
    { check: portableChecks.at(-1), code: 43 },
  ]);
});

test('a timed-out portable shell fixture stops its owned descendants and cannot pass', { timeout: 15000 }, async () => {
  const result = await runHangingPortableStage(workflow);
  assert.equal(result.timedOut, true, 'The bounded fixture must report that its deadline expired');
  assert.ok(result.result.signal !== null || result.result.code !== 0,
    'A timed-out validation shell must not report success');
  assert.deepEqual(result.calls, [portableCommand(portableChecks[0])],
    'The fixture must stop during the first deliberately stalled suite');
  assert.doesNotMatch(result.output, /^(?:PASSED:|FAILED \()/m,
    'The stuck validation command must not be reported as passed or completed');
});
