"""Independent finite local service supervisor; never reclaims existing work.

Uses the adopted supervisor's fail-closed /proc discovery and Linux subreaper.
stdin EOF / parent loss / deadline / output overflow all stop owned work.
Protocol output is bounded; signals are sent to exact observed incarnations.
"""
import ctypes
import importlib.util
import json
import os
from pathlib import Path
import selectors
import signal
import subprocess
import sys
import time

source = Path(__file__).resolve().parents[1] / "failure-gate" / "supervisor.py"
spec = importlib.util.spec_from_file_location("host_supervisor", source)
host = importlib.util.module_from_spec(spec)
spec.loader.exec_module(host)


def discover():
    # ESRCH is a process disappearing during /proc traversal, not permission
    # failure or an unreadable live process. Reobserve only that precise race;
    # every success still requires a complete fresh host discovery.
    for attempt in range(3):
        try:
            return host.descendants()
        except RuntimeError as error:
            if not isinstance(error.__cause__, ProcessLookupError) or attempt == 2:
                raise
            time.sleep(.01)


def emit(value):
    print("@runtime " + json.dumps(value), flush=True)


def main():
    node, gate, worker, options, lifetime, cleanup = sys.argv[1:]
    lifetime, cleanup = int(lifetime) / 1000, int(cleanup) / 1000
    if not (0 < lifetime <= 900 and 0 < cleanup <= 8):
        raise RuntimeError("Invalid finite service limits")
    if any(os.environ.get(k) == v for k, v in [
        ("NODE_ENV", "production"), ("REPLIT_DEPLOYMENT", "1"),
        ("REPLIT_ENVIRONMENT", "production"),
    ]):
        raise RuntimeError("Owned test service unavailable in production")
    if ctypes.CDLL(None).prctl(36, 1, 0, 0, 0) != 0:
        raise RuntimeError("Subreaper unavailable; dispatch denied")
    parent, parent_start = os.getppid(), host.incarnation(os.getppid())
    discover()  # Prove discovery before dispatch.
    deadline = time.monotonic() + lifetime
    proc = subprocess.Popen([node, gate, worker, options], stdin=subprocess.PIPE,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                            start_new_session=True)
    selector = selectors.DefaultSelector()
    selector.register(proc.stdout, selectors.EVENT_READ, "output")
    selector.register(sys.stdin, selectors.EVENT_READ, "control")
    reason, count, buffer, known = None, 0, b"", {}
    delivered = set()
    uncertain = False
    raw_exit = None
    try:
        start = host.incarnation(proc.pid)
        if not start:
            raise RuntimeError("Child registration failed")
        known[proc.pid] = start
        emit({"event": "registered", "pid": proc.pid, "start": start,
              "supervisor": {"pid": os.getpid(), "start": host.incarnation(os.getpid())}})
        proc.stdin.write(b"dispatch\n")
        proc.stdin.flush()
        while reason is None:
            known.update(discover())
            if os.getppid() != parent or host.incarnation(parent) != parent_start:
                reason = "owner-lost"
            elif time.monotonic() >= deadline:
                reason = "execution-timeout"
            elif proc.poll() is not None:
                raw_exit = proc.returncode
                reason = "child-exit"
            if reason:
                break
            for key, _ in selector.select(timeout=0.02):
                chunk = os.read(key.fileobj.fileno(), 16384)
                if key.data == "control":
                    reason = "stop-requested" if chunk else "owner-disconnected"
                    break
                if not chunk:
                    selector.unregister(key.fileobj)
                    continue
                count += len(chunk)
                if count > 1_000_000:
                    reason = "output-cap"
                    break
                buffer += chunk
                while b"\n" in buffer:
                    line, buffer = buffer.split(b"\n", 1)
                    # Forward service events only; arbitrary output stays bounded.
                    if line.startswith(b"@service "):
                        event = json.loads(line[9:])
                        if event.get("event") in ["listening", "collision", "startup-error"]:
                            emit(event)
    except Exception as error:
        reason = "discovery-or-protocol-error"
        uncertain = True
        emit({"event": "incident", "reason": str(error)})
    finally:
        end = time.monotonic() + cleanup
        while time.monotonic() < end:
            try:
                live = discover()
                known.update(live)
            except Exception:
                uncertain = True
                live = {pid: start for pid, start in known.items()
                        if host.incarnation(pid) == start}
            if not live:
                break
            sig = signal.SIGTERM if time.monotonic() < end - cleanup * .65 else signal.SIGKILL
            for pid, start in live.items():
                delivery = (pid, start, sig)
                if delivery not in delivered and host.incarnation(pid) == start:
                    try:
                        os.kill(pid, sig)
                        delivered.add(delivery)
                    except ProcessLookupError:
                        pass
            time.sleep(.02)  # Re-discover late/adopted descendants every pass.
        try:
            quiescent = not discover() and not uncertain
        except Exception:
            quiescent = False
        proc.poll()
        selector.close()
        proc.stdout.close()
        proc.stdin.close()
        while True:
            try:
                pid, _ = os.waitpid(-1, os.WNOHANG)
                if not pid:
                    break
            except ChildProcessError:
                break
        emit({"event": "finished", "reason": reason, "rawExit": proc.returncode,
              "quiescent": quiescent, "bytes": count})
        if not quiescent or reason != "stop-requested":
            sys.exit(1)


if __name__ == "__main__":
    main()
