import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const SYNC_SCRIPT = path.join(PROJECT_ROOT, "scripts", "daily-readme-sync.sh");
const GIT = spawnSync("which", ["git"], { encoding: "utf8" }).stdout.trim();
const PUSH_WRAPPER = `#!/usr/bin/env bash
set -euo pipefail

if [[ "$1" == "push" ]]; then
  count=0
  [[ -f "$PUSH_COUNT_FILE" ]] && count="$(cat "$PUSH_COUNT_FILE")"
  count=$((count + 1))
  printf '%s' "$count" > "$PUSH_COUNT_FILE"

  if [[ "$PUSH_MODE" == "advance-once" && "$count" -eq 1 ]] ||
     [[ "$PUSH_MODE" == "advance-every-time" ]]; then
    "$REAL_GIT" -C "$RACE_REPO" fetch origin main
    "$REAL_GIT" -C "$RACE_REPO" reset --hard FETCH_HEAD
    printf 'latest source from competing commit %s\\n' "$count" > "$RACE_REPO/replit.md"
    printf 'preserved competing content %s\\n' "$count" > "$RACE_REPO/competing-$count.txt"
    "$REAL_GIT" -C "$RACE_REPO" add replit.md "competing-$count.txt"
    "$REAL_GIT" -C "$RACE_REPO" commit -m "competing default-branch update $count"
    "$REAL_GIT" -C "$RACE_REPO" rev-parse HEAD >> "$COMPETING_COMMITS_FILE"
    "$REAL_GIT" -C "$RACE_REPO" push origin main
  fi
fi

exec "$REAL_GIT" "$@"
`;

function runGit(cwd, args, options = {}) {
  const result = spawnSync(GIT, args, { cwd, encoding: "utf8", ...options });
  assert.equal(result.status, 0, `git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout.trim();
}

function makeFixture(t, pushMode) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "readme-sync-"));
  const remote = path.join(directory, "remote.git");
  const working = path.join(directory, "working");
  const raceRepo = path.join(directory, "racer");
  const bin = path.join(directory, "bin");
  const pushCountFile = path.join(directory, "push-count");
  const competingCommitsFile = path.join(directory, "competing-commits");
  fs.mkdirSync(working);
  fs.mkdirSync(bin);
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  runGit(directory, ["init", "--bare", "--initial-branch=main", remote]);
  runGit(working, ["init", "--initial-branch=main"]);
  runGit(working, ["config", "user.name", "README sync test"]);
  runGit(working, ["config", "user.email", "readme-sync-test@example.invalid"]);
  fs.writeFileSync(path.join(working, "README.md"), "outdated README\n");
  fs.writeFileSync(path.join(working, "replit.md"), "initial project instructions\n");
  fs.writeFileSync(path.join(working, "existing-file.txt"), "existing content\n");
  runGit(working, ["add", "."]);
  runGit(working, ["commit", "-m", "initial default-branch commit"]);
  const initialCommit = runGit(working, ["rev-parse", "HEAD"]);
  runGit(working, ["remote", "add", "origin", remote]);
  runGit(working, ["push", "--set-upstream", "origin", "main"]);

  runGit(directory, ["clone", remote, raceRepo]);
  runGit(raceRepo, ["config", "user.name", "Competing writer"]);
  runGit(raceRepo, ["config", "user.email", "competing-writer@example.invalid"]);
  fs.writeFileSync(path.join(bin, "git"), PUSH_WRAPPER);
  fs.chmodSync(path.join(bin, "git"), 0o755);

  return {
    directory,
    remote,
    working,
    raceRepo,
    bin,
    initialCommit,
    pushCountFile,
    competingCommitsFile,
    pushMode,
  };
}

function runSync(fixture) {
  return spawnSync("bash", [SYNC_SCRIPT], {
    cwd: fixture.working,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${fixture.bin}:${process.env.PATH}`,
      REAL_GIT: GIT,
      GITHUB_REF: "refs/heads/main",
      PUSH_MODE: fixture.pushMode,
      PUSH_COUNT_FILE: fixture.pushCountFile,
      COMPETING_COMMITS_FILE: fixture.competingCommitsFile,
      RACE_REPO: fixture.raceRepo,
    },
  });
}

function remoteTip(fixture) {
  return runGit(fixture.directory, ["--git-dir", fixture.remote, "rev-parse", "refs/heads/main"]);
}

test("a concurrent default-branch commit is preserved and the sync retries from its latest source", (t) => {
  const fixture = makeFixture(t, "advance-once");
  const result = runSync(fixture);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Push attempt 1\/3 failed/);
  assert.match(result.stdout, /README\.md sync pushed successfully/);

  const tip = remoteTip(fixture);
  const parent = runGit(fixture.directory, ["--git-dir", fixture.remote, "rev-parse", `${tip}^`]);
  const competingCommit = fs.readFileSync(fixture.competingCommitsFile, "utf8").trim();
  assert.equal(parent, competingCommit, "sync commit should be based directly on the competing commit");
  assert.equal(
    runGit(fixture.directory, ["--git-dir", fixture.remote, "show", `${tip}:README.md`]),
    "latest source from competing commit 1",
  );
  assert.equal(
    runGit(fixture.directory, ["--git-dir", fixture.remote, "show", `${tip}:replit.md`]),
    "latest source from competing commit 1",
  );
  assert.equal(
    runGit(fixture.directory, ["--git-dir", fixture.remote, "show", `${tip}:existing-file.txt`]),
    "existing content",
  );
  assert.equal(
    runGit(fixture.directory, ["--git-dir", fixture.remote, "show", `${tip}:competing-1.txt`]),
    "preserved competing content 1",
  );
  assert.deepEqual(
    runGit(fixture.directory, ["--git-dir", fixture.remote, "diff-tree", "--no-commit-id", "--name-only", "-r", tip])
      .split("\n"),
    ["README.md"],
  );
  assert.equal(
    runGit(fixture.directory, ["--git-dir", fixture.remote, "merge-base", "--is-ancestor", fixture.initialCommit, tip]),
    "",
  );
  assert.equal(fs.readFileSync(fixture.pushCountFile, "utf8"), "2");
});

test("retry exhaustion fails after three conflicts without overwriting remote updates", (t) => {
  const fixture = makeFixture(t, "advance-every-time");
  const result = runSync(fixture);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /Push attempt 3\/3 failed/);
  assert.match(result.stdout, /::error::README sync could not push after 3 attempts\. No remote commits were overwritten\./);
  assert.equal(fs.readFileSync(fixture.pushCountFile, "utf8"), "3");

  const tip = remoteTip(fixture);
  const competingCommits = fs.readFileSync(fixture.competingCommitsFile, "utf8").trim().split("\n");
  assert.equal(competingCommits.length, 3);
  assert.equal(tip, competingCommits[2], "the final remote tip should remain the competing commit");
  assert.equal(
    runGit(fixture.directory, ["--git-dir", fixture.remote, "show", `${tip}:README.md`]),
    "outdated README",
  );
  assert.equal(
    runGit(fixture.directory, ["--git-dir", fixture.remote, "show", `${tip}:replit.md`]),
    "latest source from competing commit 3",
  );
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    assert.equal(
      runGit(fixture.directory, ["--git-dir", fixture.remote, "show", `${tip}:competing-${attempt}.txt`]),
      `preserved competing content ${attempt}`,
    );
  }
});
