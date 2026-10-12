import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { failedRequiredJobs } from './check-required-results.mjs';

const testLimits = { timeout: 10_000 };
const cliPath = fileURLToPath(new URL('./check-required-results.mjs', import.meta.url));
const workflow = readFileSync(new URL('../../.github/workflows/cloudpainter-ci.yml', import.meta.url), 'utf8');

function requiredJobBlock(source) {
  const marker = '  ci-required:\n';
  assert.equal(source.split(marker).length, 2, 'Expected exactly one ci-required job');
  const rest = source.split(marker)[1];
  const nextJob = rest.search(/^  [a-z0-9-]+:/m);
  return nextJob === -1 ? rest : rest.slice(0, nextJob);
}

function requiredStepBlock(source) {
  const marker = '      - name: Require every validation job to succeed\n';
  assert.equal(source.split(marker).length, 2, 'Expected exactly one required-check step');
  const rest = source.split(marker)[1];
  const nextStep = rest.search(/^      - /m);
  return nextStep === -1 ? rest : rest.slice(0, nextStep);
}

function assertRequiredWorkflowWiring(source) {
  const job = requiredJobBlock(source);
  assert.match(job, /^    if: \$\{\{ always\(\) \}\}$/m,
    'The final required check must run after validation failures and skips');

  const needs = job.match(/^    needs:\n((?:      - [a-z0-9-]+\n)+)/m);
  assert.ok(needs, 'The final required check must declare its validation dependency');
  const requiredJobs = [...needs[1].matchAll(/^      - ([a-z0-9-]+)$/gm)]
    .map((match) => match[1]);
  assert.deepEqual(requiredJobs, ['validation'],
    'The required-job list must match the final check dependency');

  const step = requiredStepBlock(job);
  assert.match(step, /^        env:\n          NEEDS_CONTEXT: \$\{\{ toJSON\(needs\) \}\}\n/m,
    'The checker must receive the actual needs context');
  const command = step.match(/^        run: (.+)$/m)?.[1];
  assert.equal(command, `node scripts/ci/check-required-results.mjs ${requiredJobs.join(' ')}`,
    'The final step must execute the checker with every required job');
}

function runCli(needsContext, requiredJobs = ['validation']) {
  const child = spawnSync(process.execPath, [cliPath, ...requiredJobs], {
    // Do not inherit credentials, NEEDS_CONTEXT, or Node startup overrides.
    env: needsContext === undefined ? {} : { NEEDS_CONTEXT: needsContext },
    encoding: 'utf8',
    timeout: 5_000,
    killSignal: 'SIGKILL',
    maxBuffer: 64 * 1024,
    shell: false,
  });
  assert.ifError(child.error);
  assert.equal(child.signal, null, 'The CLI must exit normally, not be killed');
  return child;
}

function assertCliFailure(needsContext, requiredJobs, diagnostic) {
  const child = runCli(needsContext, requiredJobs);
  assert.equal(child.status, 1, 'The actual CLI process must exit nonzero');
  assert.equal(child.stdout, '', 'A rejected input must not announce success');
  assert.match(child.stderr, /^Required-check aggregation failed:/);
  assert.match(child.stderr, diagnostic);
}

test('the final CI check always depends on and checks every validation job', testLimits, () => {
  assertRequiredWorkflowWiring(workflow);
});

for (const [label, mutate] of [
  ['removed dependency', (source) => source.replace(
    '    needs:\n      - validation\n',
    '    needs: []\n',
  )],
  ['different dependency', (source) => source.replace(
    '      - validation\n',
    '      - browser\n',
  )],
  ['missing needs context', (source) => source.replace(
    '          NEEDS_CONTEXT: ${{ toJSON(needs) }}\n',
    '',
  )],
  ['replaced no-op command', (source) => source.replace(
    '        run: node scripts/ci/check-required-results.mjs validation\n',
    '        run: true\n',
  )],
  ['missing always condition', (source) => source.replace(
    '    if: ${{ always() }}\n',
    '    if: success()\n',
  )],
]) {
  test(`invalid required-check workflow wiring is rejected: ${label}`, testLimits, () => {
    const mutated = mutate(workflow);
    assert.notEqual(mutated, workflow, 'Mutation must change the workflow fixture');
    assert.throws(() => assertRequiredWorkflowWiring(mutated), assert.AssertionError);
  });
}

test('the aggregate accepts only successful required jobs', testLimits, () => {
  assert.deepEqual(
    failedRequiredJobs({ validation: { result: 'success' } }, ['validation']),
    [],
  );
});

for (const result of ['failure', 'skipped', 'cancelled', 'timed_out', 'action_required']) {
  test(`the aggregate rejects a required job with result ${result}`, testLimits, () => {
    assert.deepEqual(
      failedRequiredJobs({ validation: { result } }, ['validation']),
      [`validation: ${result}`],
    );
  });
}

test('the aggregate rejects missing jobs and malformed needs context', testLimits, () => {
  assert.deepEqual(
    failedRequiredJobs({}, ['validation']),
    ['validation: missing result'],
  );
  assert.deepEqual(
    failedRequiredJobs(null, ['validation']),
    ['validation: missing needs result'],
  );
});

test('the aggregate checks every required job instead of passing on a partial result', testLimits, () => {
  assert.deepEqual(
    failedRequiredJobs({
      validation: { result: 'success' },
      browser: { result: 'skipped' },
    }, ['validation', 'browser']),
    ['browser: skipped'],
  );
});

for (const requiredJobs of [['validation'], ['validation', 'browser']]) {
  test(`the CLI exits zero for successful required jobs: ${requiredJobs.join(', ')}`, testLimits, () => {
    const needs = Object.fromEntries(requiredJobs.map((job) => [job, { result: 'success' }]));
    // Unrequested jobs must not affect the aggregate.
    needs.optional = { result: 'failure' };
    const child = runCli(JSON.stringify(needs), requiredJobs);
    assert.equal(child.status, 0);
    assert.equal(child.stderr, '');
    assert.equal(child.stdout, `All required jobs succeeded: ${requiredJobs.join(', ')}\n`);
  });
}

for (const [name, context] of [
  ['missing', undefined],
  ['empty', ''],
  ['invalid JSON', '{'],
]) {
  test(`the CLI exits nonzero for ${name} NEEDS_CONTEXT`, testLimits, () => {
    assertCliFailure(context, ['validation'], /needs context is missing or invalid JSON/);
  });
}

for (const context of ['null', '[]', '"success"', 'true', '42']) {
  test(`the CLI exits nonzero for non-object context ${context}`, testLimits, () => {
    assertCliFailure(context, ['validation'], /validation: missing needs result/);
  });
}

for (const [name, requiredJobs] of [
  ['empty', []],
  ['duplicate', ['validation', 'validation']],
]) {
  test(`the CLI exits nonzero for an ${name} required-job list`, testLimits, () => {
    assertCliFailure(
      '{"validation":{"result":"success"}}',
      requiredJobs,
      /provide a non-empty, unique list of required jobs/,
    );
  });
}

for (const result of ['failure', 'skipped', 'cancelled', 'timed_out', 'action_required', 'unknown', 'SUCCESS', '']) {
  test(`the CLI exits nonzero for required result ${JSON.stringify(result)}`, testLimits, () => {
    assertCliFailure(
      JSON.stringify({ validation: { result: 'success' }, browser: { result } }),
      ['validation', 'browser'],
      /- browser:/,
    );
  });
}

for (const [name, browser] of [
  ['missing job', undefined],
  ['missing result', {}],
  ['null job', null],
  ['null result', { result: null }],
]) {
  test(`the CLI exits nonzero for a ${name} after another job succeeds`, testLimits, () => {
    assertCliFailure(
      JSON.stringify({ validation: { result: 'success' }, browser }),
      ['validation', 'browser'],
      /browser: missing result/,
    );
  });
}
