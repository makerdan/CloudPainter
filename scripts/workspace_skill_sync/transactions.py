"""Persistent flock and provable ownership for disposable projection artifacts."""
import fcntl
import os
import stat
import time
import uuid
from contextlib import contextmanager

import safe_fs as disk
from inventory import projection, safe_snapshot
from protocol import FORMAT, UUID4, Failure, encode, owner, parse, require, transaction

DESTINATION = ".workspace-projections"
CONTROL = ".workspace-projection-control"


def identity(pid):
    # The comm field can contain spaces and ')'; fields after its final ') '
    # begin at field 3. Field 22 is index 19 in that tail.
    with open("/proc/sys/kernel/random/boot_id", encoding="ascii") as stream:
        boot = stream.read().strip()
    with open(f"/proc/{pid}/stat", encoding="utf-8") as stream:
        ticks = stream.read().rsplit(") ", 1)[1].split()[19]
    return boot, ticks


def dead(value):
    owner(value)
    try:
        with open("/proc/sys/kernel/random/boot_id", encoding="ascii") as stream:
            if stream.read().strip() != value["bootId"]:
                return True
        try:
            _, ticks = identity(value["pid"])
        except FileNotFoundError:
            return True
        return ticks != value["startTicks"]
    except Exception:
        return False


def current_owner():
    boot, ticks = identity(os.getpid())
    return owner({"format": FORMAT, "nonce": str(uuid.uuid4()), "pid": os.getpid(),
                  "bootId": boot, "startTicks": ticks, "createdAtMs": time.time_ns() // 1_000_000})


def atomic_record(fd, name, value, own):
    temp = "record-" + own["nonce"] + ".tmp"
    disk.write(fd, temp, encode(value))
    disk.rename(fd, temp, fd, name, replace=(name == "owner.json"))


def remove_owner(fd, own):
    if disk.info(fd, "owner.json") is not None:
        value = owner(parse(disk.read(fd, "owner.json")))
        require(value["nonce"] == own["nonce"])
        disk.remove_file(fd, "owner.json")


def inspect_abandoned(fd):
    """Validate *all* artifacts before permitting any recovery mutation."""
    transactions, temps = {}, []
    names = os.listdir(fd)
    for name in names:
        entry = disk.info(fd, name)
        require(entry is not None and not stat.S_ISLNK(entry.st_mode))
        if name == "refresh.lock":
            require(stat.S_ISREG(entry.st_mode) and entry.st_nlink == 1)
        elif name == "owner.json":
            require(stat.S_ISREG(entry.st_mode) and entry.st_nlink == 1)
            try:
                old = owner(parse(disk.read(fd, name)))
            except Exception:
                age = time.time_ns() - entry.st_mtime_ns
                require(age >= 900_000_000_000)
            else:
                require(dead(old))
        elif name.startswith("transaction-") and name.endswith(".json"):
            require(stat.S_ISREG(entry.st_mode) and entry.st_nlink == 1)
            record = transaction(parse(disk.read(fd, name)))
            nonce = record["nonce"]
            require(name == "transaction-" + nonce + ".json" and dead(record["owner"]))
            transactions[nonce] = record
        elif name.startswith("record-") and name.endswith(".tmp"):
            require(stat.S_ISREG(entry.st_mode) and entry.st_nlink == 1)
            value = parse(disk.read(fd, name))
            structured = transaction(value)["owner"] if "owner" in value else owner(value)
            require(name == "record-" + structured["nonce"] + ".tmp" and dead(structured))
            temps.append(name)
        elif name.startswith(("stage-", "backup-")):
            safe_snapshot(fd, name)
        else:
            require(False, "unknown-artifact")
    for name in names:
        if name.startswith(("stage-", "backup-")):
            nonce = name.split("-", 1)[1]
            require(UUID4.fullmatch(nonce) and nonce in transactions, "unowned-artifact")
    return transactions, temps


def recover(skills, fd, snapshot):
    try:
        records, temps = inspect_abandoned(fd)
        # Destination symlinks/special files are never movable owned artifacts.
        safe_snapshot(skills, DESTINATION)
    except Exception:
        raise Failure("busy", "ownership-uncertain") from None
    for nonce in sorted(records):
        stage, backup = "stage-" + nonce, "backup-" + nonce
        try:
            if disk.info(fd, backup) is not None:
                if disk.info(skills, DESTINATION) is None:
                    disk.rename(fd, backup, skills, DESTINATION)
                else:
                    try:
                        projection(skills, DESTINATION, snapshot)
                        valid = True
                    except Exception:
                        valid = False
                    if not valid:
                        require(disk.info(fd, stage) is None, "occupied-recovery-stage")
                        disk.rename(skills, DESTINATION, fd, stage)
                        disk.rename(fd, backup, skills, DESTINATION)
            if disk.info(fd, stage) is not None:
                disk.remove_tree(fd, stage)
            if disk.info(fd, backup) is not None:
                disk.remove_tree(fd, backup)
            disk.remove_file(fd, "transaction-" + nonce + ".json")
        except Exception:
            raise Failure("refresh-failed", "recovery-failed") from None
    for name in temps:
        disk.remove_file(fd, name)


@contextmanager
def locked(skills, create):
    try:
        identity(os.getpid())
        require(disk.local_filesystem(skills))
    except Exception:
        raise Failure("unavailable-helper", "unsupported-host") from None
    if create and disk.info(skills, CONTROL) is None:
        try:
            disk.mkdir(skills, CONTROL)
        except FileExistsError:
            pass  # Another refresh created it; the no-follow open still gates it.
        except Exception:
            raise Failure("busy", "lock-unavailable") from None
    try:
        control = disk.directory(CONTROL, skills)
        fd = control.__enter__()
    except Exception:
        raise Failure("busy", "lock-unavailable") from None
    try:
        try:
            if not disk.local_filesystem(fd) or os.fstat(fd).st_dev != os.fstat(skills).st_dev:
                raise Failure("unavailable-helper", "unsupported-filesystem")
            flags = os.O_RDWR | os.O_NOFOLLOW | os.O_CLOEXEC | os.O_NONBLOCK
            if create:
                flags |= os.O_CREAT
            lock = os.open("refresh.lock", flags, 0o600, dir_fd=fd)
            try:
                entry = os.fstat(lock)
                require(stat.S_ISREG(entry.st_mode) and entry.st_nlink == 1)
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                disk.sync(fd)
            except Exception:
                os.close(lock)
                raise
        except Failure:
            raise
        except Exception:
            raise Failure("busy", "lock-unavailable") from None
        try:
            yield fd
        finally:
            fcntl.flock(lock, fcntl.LOCK_UN)
            os.close(lock)
    finally:
        control.__exit__(None, None, None)
