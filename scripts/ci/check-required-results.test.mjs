import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { failedRequiredJobs } from './check-required-results.mjs';

const testLimits = { timeout: 10_000 };
const cliPath = fileURLToPath(new URL('./check-required-results.mjs', import.meta.url));

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
