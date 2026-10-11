import assert from 'node:assert/strict';
import test from 'node:test';
import { failedRequiredJobs } from './check-required-results.mjs';

test('the aggregate accepts only successful required jobs', () => {
  assert.deepEqual(
    failedRequiredJobs({ validation: { result: 'success' } }, ['validation']),
    [],
  );
});

for (const result of ['failure', 'skipped', 'cancelled', 'timed_out', 'action_required']) {
  test(`the aggregate rejects a required job with result ${result}`, () => {
    assert.deepEqual(
      failedRequiredJobs({ validation: { result } }, ['validation']),
      [`validation: ${result}`],
    );
  });
}

test('the aggregate rejects missing jobs and malformed needs context', () => {
  assert.deepEqual(
    failedRequiredJobs({}, ['validation']),
    ['validation: missing result'],
  );
  assert.deepEqual(
    failedRequiredJobs(null, ['validation']),
    ['validation: missing needs result'],
  );
});

test('the aggregate checks every required job instead of passing on a partial result', () => {
  assert.deepEqual(
    failedRequiredJobs({
      validation: { result: 'success' },
      browser: { result: 'skipped' },
    }, ['validation', 'browser']),
    ['browser: skipped'],
  );
});
