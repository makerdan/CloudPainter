// Code-owned nested test-fast step, not an independent authorization route.
// Admission, credential-free environment, process-tree supervision and unchanged
// 60s step / 120s tier / 5s cleanup bounds belong to the Unified parent runner.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const archivePath = "attached_assets/port-authority-clock-test-repair_1792370288101.zip";
const digest = "9ea10f440242655f9a0bfa800e7cf803602186365de243ed2356c191111f3098";
const skillDigest = "b495c93a5fe9495d396fb8615a1cca6eaf66d01244072f05ff58790406102717";
const installed = join(root, ".agents/skills/port-authority");
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
assert.equal(hash(readFileSync(join(root, archivePath))), digest, "Approved ZIP digest");
const base = join(root, "generated-artifacts/port-authority-clock");
mkdirSync(base, { recursive: true });
const target = mkdtempSync(join(base, "proof-"));

// zipfile verifies CRC and Unix regular-file metadata, not merely unzip's names.
// Never execute archive hooks. The manifest is self-excluded only, pinned by ZIP.
const verification = spawnSync("python3", ["-c", `
import hashlib,json,pathlib,stat,sys,zipfile
archive,installed,target=map(pathlib.Path,sys.argv[1:])
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None, "ZIP CRC"
    names=z.namelist()
    assert len(names)==len(set(names))==34, "unique complete membership"
    for i in z.infolist():
        p=pathlib.PurePosixPath(i.filename)
        assert not p.is_absolute() and ".." not in p.parts and str(p)==i.filename
        assert "\\\\" not in i.filename and stat.S_ISREG(i.external_attr>>16)
    m=json.loads(z.read("PACKAGE-MANIFEST.json"))
    assert m["schemaVersion"]==1 and m["skillIdentity"]=="port-authority"
    assert len(m["files"])==33
    assert {f["path"] for f in m["files"]}==set(names)-{"PACKAGE-MANIFEST.json"}
    for f in m["files"]:
        assert hashlib.sha256(z.read(f["path"])).hexdigest()==f["sha256"], f["path"]
    for parent in [installed,*installed.parents]:
        assert not parent.is_symlink(), "canonical ancestor symlink"
    actual=[]
    for p in installed.rglob("*"):
        assert not p.is_symlink(), "installed symlink"
        if not p.is_dir():
            assert p.is_file(), "installed nonregular member"
            actual.append(p.relative_to(installed).as_posix())
    assert set(actual)==set(names), "exact installed membership"
    for name in names:
        data=z.read(name)
        assert (installed/name).read_bytes()==data, "installed bytes: "+name
        out=target/name
        out.parent.mkdir(parents=True,exist_ok=True)
        out.write_bytes(data)
    print(json.dumps({"members":len(names),"manifestEntries":len(m["files"]),
        "manifestSha256":hashlib.sha256(z.read("PACKAGE-MANIFEST.json")).hexdigest()}))
`, join(root, archivePath), installed, target], {
  encoding: "utf8", timeout: 5000, maxBuffer: 200000,
});
assert.ifError(verification.error);
assert.equal(verification.status, 0, verification.stderr);
const verified = JSON.parse(verification.stdout);
assert.equal(hash(readFileSync(join(installed, "SKILL.md"))), skillDigest, "Canonical SKILL pin");
const modules = [
  "scripts/free-ports.mjs", "scripts/host-capabilities.mjs",
  "scripts/runtime-environment.mjs", "scripts/validation-lock.mjs",
  "tests/core.test.mjs", "tests/hardening.test.mjs",
];
for (const name of modules) {
  const check = spawnSync(process.execPath, ["--check", join(installed, name)], {
    encoding: "utf8", timeout: 3000, maxBuffer: 200000,
  });
  assert.ifError(check.error);
  assert.equal(check.status, 0, name + "\n" + check.stderr);
}

// Execute original package bodies/helpers, not the older local replacements.
// The helper adjustment retains uncertain private leases rather than deleting
// them. The owner-approved case adjustment below changes only replacement queue
// headroom. Installed bytes stay exact; core already retains uncertain leases.
const testFile = join(target, "tests/hardening.test.mjs");
const original = readFileSync(testFile, "utf8");
const teardown = "    rmSync(dir, { recursive: true, force: true });";
const keepUncertain = `    if (existsSync(env.VALIDATION_LOCK_FILE)) {
      console.log(JSON.stringify({ incident: "private-lease-retained", stateDirectory: dir }));
    } else { rmSync(dir, { recursive: true, force: true }); }`;
assert.equal(original.split(teardown).length, 2, "One exact helper teardown boundary");
const replacementWaiter = "    }catch(e){if(e.message==='OVERLAP')throw e;}`);";
const correctedWaiter = "    }catch(e){if(e.message==='OVERLAP')throw e;}`, { VALIDATION_LOCK_TIMEOUT_MS: \"8000\" });";
const caseStart = original.indexOf('test("execution budget stops owned work before replacement",');
const caseEnd = original.indexOf('\ntest("all validation budgets are explicit, finite and timer-safe before dispatch",', caseStart);
assert(caseStart > 0 && caseEnd > caseStart, "One exact package replacement-budget case");
const replacementCase = original.slice(caseStart, caseEnd);
assert.equal(replacementCase.split(replacementWaiter).length, 2, "One exact replacement waiter");
const correctedCase = replacementCase.replace(replacementWaiter, correctedWaiter);
const harness = (original.slice(0, caseStart) + correctedCase + original.slice(caseEnd))
  .replace(teardown, keepUncertain);
writeFileSync(testFile, harness);
const cases = [
  "core: missing/overflow limits deny and execution expiry cannot become success",
  "expired admission evidence does not disable supervision of an already dispatched child",
  "execution budget stops owned work before replacement",
  "direct package-script dispatcher fixture cannot bypass outer execution deadline",
  "async test and hanging hook report finite timeout; outer wrapper stops remaining handles",
  "outer supervisor stops synchronous test despite its blocked per-test timer",
  "wall-clock reversal: expiry before dispatch returns 4 and retains the unfinalized lease",
  "wall-clock reversal: confirmed dispatched work times out with exit 1 and verified cleanup",
  "wall-clock reversal: queue expiry returns 3 without dispatch or changing the live owner's lease",
  "late raw zero cannot win the execution deadline race",
];
for (const name of cases) {
  const source = readFileSync(join(target, name.startsWith("core:") ? "tests/core.test.mjs" : "tests/hardening.test.mjs"), "utf8");
  assert.equal(source.split(`test(${JSON.stringify(name)},`).length, 2, "Unique packaged case: " + name);
}
const pattern = "^(?:" + cases.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")$";
const argv = [
  "--test", "--test-reporter=tap", "--test-timeout=15000",
  "--test-name-pattern=" + pattern, testFile,
];
writeFileSync(join(target, "source.json"), JSON.stringify({
  archive: archivePath, sha256: digest, skillSha256: skillDigest, ...verified,
  installedModules: modules.map(file => ({ file, sha256: hash(readFileSync(join(installed, file))) })),
  runnerSha256: hash(readFileSync(fileURLToPath(import.meta.url))),
  packageHardeningSha256: hash(original), privateHarnessSha256: hash(harness),
  harnessAdjustment: "Helper teardown retains uncertain leases. Owner-approved private execution-budget replacement waiter alone gets an 8000ms queue limit; all assertions, first-workload limit and phase case bodies unchanged.",
  replacementWaiterCorrection: { before: replacementWaiter, after: correctedWaiter, queueLimitMs: 8000 },
  cases, argv, scope: "focused private package proof, not full-package or host acceptance",
  runtimeChanges: false, liveActivation: false,
}, null, 2) + "\n");
// One finite child, no standalone package supervisor's 180s budget. The parent
// remains responsible for transitive cleanup even if this child times out.
const run = spawnSync(process.execPath, argv, {
  cwd: root, env: process.env, encoding: "utf8", timeout: 52000, maxBuffer: 900000,
});
const output = (run.stdout ?? "") + (run.stderr ?? "");
writeFileSync(join(target, "proof.tap"), output);
process.stdout.write(output);
console.log("# verified source and private evidence: " + target.slice(root.length + 1));
if (run.error) console.error(run.error.message);
// A partial transcript, missing phase, skip, cancellation or unexpected extra
// test cannot certify this package. Exact bodies retain their exact exit asserts.
const allCasesObserved = cases.every(name => output.includes("ok ") &&
  output.split("\n").some(line => /^ok \d+ - /.test(line) && line.slice(line.indexOf(" - ") + 3) === name));
process.exitCode = !run.error && run.status === 0 && allCasesObserved &&
  new RegExp("^# tests " + cases.length + "$", "m").test(output) &&
  new RegExp("^# pass " + cases.length + "$", "m").test(output) &&
  /^# fail 0$/m.test(output) && /^# skipped 0$/m.test(output) &&
  /^# cancelled 0$/m.test(output) ? 0 : 1;
