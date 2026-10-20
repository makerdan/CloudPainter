"""Finite Linux fixture/command supervisor. No reclaim of pre-existing processes."""
import ctypes
import json
import os
from pathlib import Path
import selectors
import signal
import subprocess
import sys
import time


def descendants():
    table = {}
    for p in Path("/proc").glob("[0-9]*/stat"):
        try:
            fields = p.read_text().rsplit(")", 1)[1].split()
            if fields[0] != "Z":
                table[int(p.parent.name)] = (int(fields[1]), fields[19])
        except FileNotFoundError:
            continue
        except (OSError, ValueError, IndexError) as error:
            raise RuntimeError("Process discovery incomplete; cleanup unknown") from error
    owned = {os.getpid()}
    while True:
        expanded = owned | {pid for pid, (ppid, _) in table.items() if ppid in owned}
        if expanded == owned:
            return {pid: table[pid][1] for pid in owned - {os.getpid()} if pid in table}
        owned = expanded


def incarnation(pid):
    try:
        return Path(f"/proc/{pid}/stat").read_text().rsplit(")", 1)[1].split()[19]
    except (OSError, IndexError):
        return None


def main():
    limit, cleanup, log_file, command = sys.argv[1:]
    limit, cleanup = int(limit) / 1000, int(cleanup) / 1000
    if limit <= 0 or cleanup <= 0:
        raise RuntimeError("Invalid finite budget")
    if ctypes.CDLL(None).prctl(36, 1, 0, 0, 0) != 0:
        raise RuntimeError("Subreaper unavailable; refusing launch")
    parent = os.getppid()
    deadline = time.monotonic() + limit
    proc = subprocess.Popen(json.loads(command), stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, start_new_session=True)
    selector = selectors.DefaultSelector()
    selector.register(proc.stdout, selectors.EVENT_READ)
    blocked, size = None, 0
    try:
        with open(log_file, "xb") as log:
            while selector.get_map():
                if os.getppid() != parent:
                    blocked = "supervising-parent-lost"
                    break
                if time.monotonic() >= deadline:
                    blocked = "timeout"
                    break
                for event, _ in selector.select(timeout=0.025):
                    chunk = os.read(event.fileobj.fileno(), 16384)
                    if not chunk:
                        selector.unregister(event.fileobj)
                        continue
                    size += len(chunk)
                    if size > 1_000_000:
                        blocked = "output-cap"
                        break
                    log.write(chunk)
                if blocked:
                    break
            if not blocked:
                try:
                    proc.wait(timeout=max(0.001, deadline - time.monotonic()))
                except subprocess.TimeoutExpired:
                    blocked = "timeout"
    finally:
        # Bound cleanup, verify incarnation before each signal, and reap adopted children.
        end = time.monotonic() + cleanup
        for sig, fraction in [(signal.SIGTERM, 0.25), (signal.SIGKILL, 0.65)]:
            for pid, start in descendants().items():
                if incarnation(pid) == start:
                    try:
                        os.kill(pid, sig)
                    except ProcessLookupError:
                        pass
            until = min(end, time.monotonic() + cleanup * fraction)
            while descendants() and time.monotonic() < until:
                time.sleep(0.02)
        while True:
            try:
                pid, _ = os.waitpid(-1, os.WNOHANG)
                if not pid:
                    break
            except ChildProcessError:
                break
        selector.close()
        proc.stdout.close()
    result = {"exit": proc.poll(), "blocked": blocked, "quiescent": not descendants(), "bytes": size}
    print(json.dumps(result), flush=True)


if __name__ == "__main__":
    main()
