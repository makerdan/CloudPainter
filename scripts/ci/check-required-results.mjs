export function failedRequiredJobs(needs, requiredJobs) {
  if (!needs || typeof needs !== 'object' || Array.isArray(needs)) {
    return requiredJobs.map((job) => `${job}: missing needs result`);
  }

  const failures = [];
  for (const job of requiredJobs) {
    const result = needs[job]?.result;
    if (result !== 'success') {
      failures.push(`${job}: ${result ?? 'missing result'}`);
    }
  }
  return failures;
}

function main() {
  let needs;
  try {
    needs = JSON.parse(process.env.NEEDS_CONTEXT ?? '');
  } catch {
    console.error('Required-check aggregation failed: needs context is missing or invalid JSON.');
    process.exitCode = 1;
    return;
  }

  const requiredJobs = process.argv.slice(2);
  if (requiredJobs.length === 0 || new Set(requiredJobs).size !== requiredJobs.length) {
    console.error('Required-check aggregation failed: provide a non-empty, unique list of required jobs.');
    process.exitCode = 1;
    return;
  }

  const failures = failedRequiredJobs(needs, requiredJobs);
  if (failures.length > 0) {
    console.error(`Required-check aggregation failed:\n${failures.map((failure) => `- ${failure}`).join('\n')}`);
    process.exitCode = 1;
    return;
  }

  console.log(`All required jobs succeeded: ${requiredJobs.join(', ')}`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main();
}
