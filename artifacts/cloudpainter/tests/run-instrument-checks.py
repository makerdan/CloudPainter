"""Owner-authorized local checks, not a Failure Gate tier or activation.

Independent monotonic supervisor: <=300 seconds/check, <=900 seconds total.
Reentry uses the same ignored deadline record. Never resets a consumed budget.
Linux subreaper tracks adopted descendants, including browser helper processes.
"""
import ctypes
import json
import os
from pathlib import Path
import selectors
import signal
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[3]
# Separate approval/deadline for the layer clipboard task. Never reset either
# operation's existing deadline, and restrict clipboard mode to its scoped checks.
clipboard_mode = len(sys.argv) > 1 and sys.argv[1] == "--clipboard"
if clipboard_mode:
    sys.argv.pop(1)
OUT = ROOT / ("generated-artifacts/clipboard-validation" if clipboard_mode
              else "generated-artifacts/instrument-validation")
OUT.mkdir(parents=True, exist_ok=True)
if ctypes.CDLL(None).prctl(36, 1, 0, 0, 0) != 0:
    raise RuntimeError("Child subreaper unavailable; refusing launch")
budget_path = OUT / "budget.json"
boot = Path("/proc/sys/kernel/random/boot_id").read_text().strip()
if budget_path.exists():
    budget = json.loads(budget_path.read_text())
    if budget["boot"] != boot:
        raise RuntimeError("Clock lineage changed; new approval required")
else:
    budget = {"boot": boot, "deadline": time.monotonic() + 900}
    budget_path.write_text(json.dumps(budget))

def children():
    parents = {}
    for path in Path("/proc").glob("[0-9]*/stat"):
        try:
            fields = path.read_text().rsplit(")", 1)[1].split()
            # Exclude zombies; they are already terminal.
            if fields[0] != "Z":
                parents[int(path.parent.name)] = int(fields[1])
        except (OSError, ValueError, IndexError):
            pass
    owned = {os.getpid()}
    while True:
        next_owned = owned | {pid for pid, ppid in parents.items() if ppid in owned}
        if next_owned == owned:
            return owned - {os.getpid()}
        owned = next_owned

def run(name, command, limit):
    remaining = budget["deadline"] - time.monotonic()
    if remaining < limit + 30:
        raise RuntimeError("Insufficient cumulative budget including cleanup")
    start = time.monotonic()
    deadline = min(start + limit, budget["deadline"] - 30)
    proc = subprocess.Popen(command, cwd=ROOT, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, start_new_session=True)
    selector = selectors.DefaultSelector()
    selector.register(proc.stdout, selectors.EVENT_READ)
    count, blocked = 0, None
    log_path = OUT / f"{name}-{time.time_ns()}.log"
    with log_path.open("wb") as log:
        while selector.get_map():
            if time.monotonic() >= deadline:
                blocked = "deadline"; break
            for event, _ in selector.select(timeout=0.1):
                chunk = os.read(event.fileobj.fileno(), 16384)
                if not chunk:
                    selector.unregister(event.fileobj); continue
                count += len(chunk)
                if count > 1_000_000:
                    blocked = "output-cap"; break
                log.write(chunk)
                sys.stdout.buffer.write(chunk); sys.stdout.buffer.flush()
            if blocked:
                break
    if not blocked:
        try:
            proc.wait(timeout=max(0.1, deadline - time.monotonic()))
        except subprocess.TimeoutExpired:
            blocked = "deadline"
    # Always terminate remaining owned descendants; never signal unrelated servers.
    cleanup_deadline = min(time.monotonic() + 20, budget["deadline"] - 5)
    for sig, grace in [(signal.SIGTERM, 3), (signal.SIGKILL, 7)]:
        owned = children()
        for pid in owned:
            try:
                os.kill(pid, sig)
            except ProcessLookupError:
                pass
        end = min(time.monotonic() + grace, cleanup_deadline)
        while children() and time.monotonic() < end:
            time.sleep(0.05)
    proc.wait(timeout=max(0.1, cleanup_deadline - time.monotonic()))
    while True:
        try:
            pid, _ = os.waitpid(-1, os.WNOHANG)
            if not pid:
                break
        except ChildProcessError:
            break
    quiescent = not children()
    selector.close()
    proc.stdout.close()
    result = {"name": name, "command": command, "exit": proc.returncode, "blocked": blocked,
              "quiescent": quiescent, "seconds": time.monotonic() - start, "log": str(log_path)}
    with (OUT / "results.jsonl").open("a") as file:
        file.write(json.dumps(result) + "\n")
    print(json.dumps(result), flush=True)
    if blocked or not quiescent:
        raise RuntimeError("Incomplete supervised check; no further launches")
    return proc.returncode

checks = {
    "typecheck": (["pnpm", "run", "typecheck"], 150),
    "drawing-tools": (["pnpm", "--filter", "@workspace/cloudpainter", "run", "test:drawing-tools"], 30),
    "renderer": (["pnpm", "--filter", "@workspace/cloudpainter", "run", "test:stroke-renderer"], 30),
    "image-dimensions": (["pnpm", "--filter", "@workspace/cloudpainter", "exec", "node",
                          "--experimental-strip-types", "--test", "--test-timeout=10000",
                          "src/lib/imageDimensions.test.ts"], 30),
    "browser": (["pnpm", "--filter", "@workspace/cloudpainter", "run", "test:instruments-browser"], 270),
    "standard-browser": (["pnpm", "--filter", "@workspace/cloudpainter", "run", "test:photo-card"], 270),
    "browser-phone": (["pnpm", "--filter", "@workspace/cloudpainter", "run", "test:instruments-browser",
                       "--grep", "phone instrument buttons"], 90),
    "browser-desktop": (["pnpm", "--filter", "@workspace/cloudpainter", "run", "test:instruments-browser",
                         "--grep", "all instruments preserve pixels"], 90),
}
failed = False
if clipboard_mode:
    checks = {
        "typecheck": checks["typecheck"],
        "renderer": checks["renderer"],
        "image-dimensions": checks["image-dimensions"],
        "clipboard": (["pnpm", "--filter", "@workspace/cloudpainter", "run", "test:layer-clipboard"], 30),
        "clipboard-browser": (["pnpm", "--filter", "@workspace/cloudpainter", "run", "test:clipboard-browser"], 270),
        "standard-browser-discovery": (["pnpm", "--filter", "@workspace/cloudpainter", "run", "test:photo-card", "--list"], 30),
        "recovery-browser": (["pnpm", "--filter", "@workspace/cloudpainter", "exec", "playwright", "test",
                             "--config", "playwright.config.ts", "ImageGenerator.test.tsx",
                             "--grep-invert", "signed-in generation"], 270),
    }
for name in sys.argv[1:]:
    command, limit = checks[name]
    if "browser" in name and not os.environ.get("CLOUDPAINTER_TEST_URL"):
        raise RuntimeError("Preview URL missing; refusing launch")
    if name == "standard-browser":
        state = os.environ.get("CLOUDPAINTER_AUTH_STATE")
        if not state or not Path(state).is_file():
            raise RuntimeError("Signed-in test storage-state file missing; refusing combined suite")
    failed = run(name, command, limit) != 0 or failed
sys.exit(1 if failed else 0)
