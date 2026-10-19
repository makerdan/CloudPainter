"""Disposable-only integration fixtures. No production helper adapter overrides."""
import copy
import fcntl
import io
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile
import time
import uuid
from contextlib import contextmanager
from unittest.mock import patch

REPOSITORY = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPOSITORY / "scripts/workspace_skill_sync"))
import engine
import inventory
import protocol as p
import safe_fs as disk
import transactions as tx

CASE = sys.argv[1]


class FixtureAuthority:
    publication = staticmethod(lambda source: True)
    metadata = staticmethod(lambda version: version == p.FORMAT)


@contextmanager
def fixture():
    with tempfile.TemporaryDirectory(prefix="workspace-skill-fixture-") as temp:
        base = Path(temp)
        root, source = base / "project", base / "source"
        (root / ".agents/skills/authored").mkdir(parents=True)
        (root / ".agents/skills/authored/SKILL.md").write_bytes(b"project-authored\n")
        source.mkdir()
        (source / ".workspace-revision").write_bytes(b"opaque \nrevision\n")
        (source / "example").mkdir()
        (source / "example/SKILL.md").write_bytes(b"x\n")
        exclusions = "".join("/" + name + "/\n" for name in engine.BOUNDARIES)
        (root / ".gitignore").write_text(exclusions)
        (root / ".replitignore").write_text(exclusions)
        subprocess.run(["git", "init", "-q", str(root)], check=True, capture_output=True)
        helper = engine.Helper(str(root), str(source), FixtureAuthority())
        yield base, root, source, helper


def failure(call, outcome=None):
    try:
        call()
    except Exception as error:
        if outcome:
            assert isinstance(error, p.Failure), (type(error), error)
            assert error.outcome == outcome, (error.outcome, outcome)
        return error
    raise AssertionError("expected-failure")


def snapshot(path):
    # Ignore access time: a read-only operation may update it by filesystem
    # policy. Include names, bytes, types, inode, mode, mtime and ctime.
    result = {}
    for parent, directories, files in os.walk(path, followlinks=False):
        for name in directories + files:
            file = Path(parent) / name
            st = file.lstat()
            result[str(file.relative_to(path))] = (
                st.st_ino, st.st_mode, st.st_mtime_ns, st.st_ctime_ns,
                os.readlink(file) if file.is_symlink() else file.read_bytes() if file.is_file() else None,
            )
    return result


def projection(root):
    return root / ".agents/skills" / tx.DESTINATION


def control(root):
    return root / ".agents/skills" / tx.CONTROL


def make_dead():
    value = tx.current_owner()
    # Valid but different boot identity proves death independently of PID reuse.
    value["bootId"] = "00000000-0000-0000-0000-000000000000"
    return value


def abandoned(root, kind=None, owner=None):
    fd = control(root)
    fd.mkdir(exist_ok=True)
    (fd / "refresh.lock").touch(exist_ok=True)
    own = owner or make_dead()
    name = "transaction-" + own["nonce"] + ".json"
    (fd / name).write_bytes(p.encode({"format": p.FORMAT, "nonce": own["nonce"], "owner": own}))
    if kind:
        (fd / (kind + "-" + own["nonce"])).mkdir()
    return own


def mirror(root, source_snapshot):
    directory = root / ".local/custom_skills/example"
    directory.mkdir(parents=True)
    metadata = {"format": p.FORMAT, "skillId": "example",
                "sourceRevision": source_snapshot[0]["sourceRevision"],
                "fingerprint": source_snapshot[0]["skills"][0]["fingerprint"]}
    (directory / p.SIDECAR).write_bytes(p.encode(metadata))
    return directory, metadata


def protocol_vector():
    assert p.fingerprint({"SKILL.md": b"x\n"}) == "f113149da3d0f648ad79425de0c84f3a975d12b7032555f02a55888d6e5d4f1a"
    # Length framing distinguishes otherwise ambiguous concatenations.
    assert p.fingerprint({"a": b"bc", "SKILL.md": b""}) != p.fingerprint({"ab": b"c", "SKILL.md": b""})
    for invalid in ("", "A", "-a", "a-", "a--b", "a" * 65, "é", "../a", "a\n"):
        assert not p.skill_id(invalid)
    for value in ("x", "a-b", "0", "a" * 64):
        assert p.skill_id(value)
    for invalid in ("../a", "/a", "a//b", "a/./b", "a\\b", "a\x00", "a\x85", "\udcff"):
        failure(lambda: p.relative(invalid))


def cli_contract():
    cli = REPOSITORY / "scripts/workspace_skill_sync/cli.py"
    with fixture() as (_, root, source, helper):
        before = snapshot(root), snapshot(source)
        for command in ("refresh", "status"):
            env = {"PATH": os.environ["PATH"], "WORKSPACE_SKILLS_SOURCE": str(source)}
            result = subprocess.run(["python3", "-B", str(cli), command, "--contract-version"],
                                    capture_output=True, env=env, cwd=root)
            assert (result.returncode, result.stdout, result.stderr) == (0, b"workspace-skill/v1\n", b"")
            for args in ([], ["--skill"], ["--skill", "a", "--skill", "a"],
                         ["--skill", "../x"], ["--contract-version", "--skill", "example"],
                         ["--x", "example"], ["--skill", "a" * 65], ["--", "--", "--skill", "a"]):
                result = subprocess.run(["python3", "-B", str(cli), command, *args], capture_output=True, env=env)
                assert result.returncode == 4
                assert json.loads(result.stdout) == {"outcome": "unavailable-helper", "skillId": None}
                assert result.stderr == b"invalid-arguments\n"
            for arguments in (["--skill", "example"], ["--", "--skill", "example"]):
                result = subprocess.run(["python3", "-B", str(cli), command, *arguments],
                                        capture_output=True, env={"PATH": os.environ["PATH"]})
                assert result.returncode == 2
                assert json.loads(result.stdout) == {"outcome": "unavailable-source", "skillId": "example"}
                assert result.stderr == b"source-unavailable\n"
        assert before == (snapshot(root), snapshot(source))
    package = json.loads((REPOSITORY / "package.json").read_text())
    assert package["scripts"]["workspace-skill:refresh"].endswith("cli.py refresh")
    assert package["scripts"]["workspace-skill:status"].endswith("cli.py status")
    import cli
    from contextlib import redirect_stderr, redirect_stdout
    for command, outcomes in (
        ("refresh", {"pass": 0, "invalid-contract": 1, "unavailable-source": 2, "missing-skill": 3,
                     "unavailable-helper": 4, "busy": 5, "refresh-failed": 6}),
        ("status", {"pass": 0, "mismatch": 1, "unavailable-source": 2,
                    "missing-mirror": 3, "unavailable-helper": 4}),
    ):
        for outcome, code in outcomes.items():
            class Stub:
                def refresh(self, requested):
                    if outcome != "pass":
                        raise p.Failure(outcome, "bounded-reason")
                status = refresh
            data, errors = io.BytesIO(), io.StringIO()
            stream = io.TextIOWrapper(data, encoding="utf-8")
            with patch.object(engine, "Helper", lambda _: Stub()), redirect_stdout(stream), redirect_stderr(errors):
                assert cli.main([command, "--skill", "example"]) == code
                stream.flush()
            assert data.getvalue() == p.encode({"outcome": outcome, "skillId": "example"})
            assert errors.getvalue() == ("" if outcome == "pass" else "bounded-reason\n")
    class Broken:
        def refresh(self, requested):
            raise RuntimeError("/private-location confidential-instructions")
        status = refresh
    data, errors = io.BytesIO(), io.StringIO()
    stream = io.TextIOWrapper(data, encoding="utf-8")
    with patch.object(engine, "Helper", lambda _: Broken()), redirect_stdout(stream), redirect_stderr(errors):
        assert cli.main(["refresh", "--skill", "example"]) == 6
        stream.flush()
    assert errors.getvalue() == "operation-failed\n"
    assert b"private" not in data.getvalue()


def inventory_order_and_bytes():
    with fixture() as (_, root, source, helper):
        (source / "a").mkdir()
        (source / "a/SKILL.md").write_bytes(b"\r\n")
        directory = source / "example"
        (directory / ".hidden").write_bytes(b"\xff\x00")
        (directory / "é").write_bytes(b"utf8-path")
        (directory / "z").write_bytes(b"z")
        (directory / "nested").mkdir()
        (directory / "nested/data").write_bytes(b"\x00\xff\n")
        manifest, data = helper.snapshot()
        assert manifest["sourceRevision"] == "opaque \nrevision\n"
        assert [s["id"] for s in manifest["skills"]] == ["a", "example"]
        names = [f["path"] for f in manifest["skills"][1]["files"]]
        assert names == sorted(names, key=lambda v: v.encode("utf-8"))
        helper.refresh("example")
        assert helper.load("example")[".hidden"] == b"\xff\x00"
        assert helper.load("example", ["nested/data"]) == {"nested/data": b"\x00\xff\n"}
        assert "a/SKILL.md" not in helper.load("example")


def hostile_source():
    scenarios = [
        lambda s, b: (s / "unexpected").write_bytes(b"file"),
        lambda s, b: (s / "Bad").mkdir(),
        lambda s, b: (s / "example/empty").mkdir(),
        lambda s, b: (s / "example" / p.SIDECAR).write_text("{}"),
        lambda s, b: (s / "example/SKILL.md").unlink(),
        lambda s, b: (s / "example/link").symlink_to(b),
        lambda s, b: os.mkfifo(s / "example/fifo"),
        lambda s, b: (s / ".workspace-revision").write_bytes(b"\xff"),
        lambda s, b: (s / ".workspace-revision").write_bytes(b" \n"),
        lambda s, b: (s / "example/unsafe\\path").write_bytes(b"bad"),
        lambda s, b: (s / "example/unsafe\npath").write_bytes(b"bad"),
        lambda s, b: (s / "example/SKILL.md").chmod(0),
        lambda s, b: os.close(os.open(os.fsencode(s / "example") + b"/\xff", os.O_CREAT | os.O_WRONLY, 0o600)),
    ]
    for scenario in scenarios:
        with fixture() as (base, root, source, helper):
            outside = base / "outside"
            outside.mkdir()
            (outside / "sentinel").write_bytes(b"untouched")
            scenario(source, outside)
            before = snapshot(root), snapshot(outside)
            failure(lambda: helper.refresh("example"), "unavailable-source")
            assert before == (snapshot(root), snapshot(outside))
    with fixture() as (base, root, source, helper):
        alias = base / "alias"
        alias.symlink_to(source, target_is_directory=True)
        helper.source = str(alias)
        failure(lambda: helper.refresh("example"), "unavailable-source")
        helper.source = str(base / "alias/example/..")
        failure(lambda: helper.refresh("example"), "unavailable-source")
    with fixture() as (_, root, source, helper):
        before = snapshot(root)
        failure(lambda: helper.refresh("missing"), "missing-skill")
        assert before == snapshot(root)


def manifest_strictness():
    with fixture() as (_, root, source, helper):
        helper.refresh("example")
        canonical = helper.snapshot()[0]
        target = projection(root) / p.MANIFEST
        variants = []
        bad = copy.deepcopy(canonical); bad["extra"] = True; variants.append(bad)
        bad = copy.deepcopy(canonical); bad["skills"][0]["files"][0]["bytes"] = True; variants.append(bad)
        bad = copy.deepcopy(canonical); bad["skills"][0]["files"][0]["bytes"] = 9007199254740992; variants.append(bad)
        bad = copy.deepcopy(canonical); bad["skills"][0]["files"][0]["path"] = "../escape"; variants.append(bad)
        bad = copy.deepcopy(canonical); bad["skills"] *= 2; variants.append(bad)
        bad = copy.deepcopy(canonical); bad["format"] = "workspace-skill/v2"; variants.append(bad)
        bad = copy.deepcopy(canonical); bad["skills"][0]["files"] *= 2; variants.append(bad)
        bad = copy.deepcopy(canonical); bad["skills"][0]["fingerprint"] = "F" * 64; variants.append(bad)
        bad = copy.deepcopy(canonical); bad["skills"][0]["files"][0]["bytes"] = 2.0; variants.append(bad)
        for bad in variants:
            target.write_bytes(p.encode(bad))
            failure(lambda: helper.load("example"))
        target.write_bytes(b'{"format":"workspace-skill/v1","format":"workspace-skill/v1"}')
        failure(lambda: helper.load("example"))
        target.write_bytes(p.encode(canonical))
        (projection(root) / "extra").write_text("extra")
        failure(lambda: helper.load("example"))
        (projection(root) / "extra").unlink()
        (projection(root) / "empty").mkdir()
        failure(lambda: helper.load("example"))


def refresh_and_locked_load():
    with fixture() as (_, root, source, helper):
        helper.refresh("example")
        assert helper.load("example") == {"SKILL.md": b"x\n"}
        assert helper.load("example", []) == {}
        failure(lambda: helper.load("example", ["../authored/SKILL.md"]))
        target = projection(root) / "example/SKILL.md"
        target.write_bytes(b"corrupt")
        failure(lambda: helper.load("example"))
        helper.refresh("example")
        target.unlink()
        target.symlink_to(source / "example/SKILL.md")
        failure(lambda: helper.load("example"))
        # No cleanup or repair of symlink-bearing destinations.
        failure(lambda: helper.refresh("example"), "busy")
        assert target.is_symlink()
    with fixture() as (_, root, source, helper):
        helper.refresh("example")
        seen = []
        original = engine.projection
        def validated(*args):
            lock = os.open(control(root) / "refresh.lock", os.O_RDWR)
            try:
                failure(lambda: fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB))
                seen.append(True)
            finally:
                os.close(lock)
            return original(*args)
        with patch.object(engine, "projection", validated):
            assert helper.load("example", ["SKILL.md"]) == {"SKILL.md": b"x\n"}
        assert seen


def source_drift():
    with fixture() as (_, root, source, helper):
        helper.refresh("example")
        prior = snapshot(projection(root))
        original = engine.stage
        def changing(*args):
            original(*args)
            (source / "example/SKILL.md").write_bytes(b"changed\n")
        with patch.object(engine, "stage", changing):
            failure(lambda: helper.refresh("example"), "refresh-failed")
        assert snapshot(projection(root)) == prior
        failure(lambda: helper.load("example"))
        assert set(os.listdir(control(root))) == {"refresh.lock"}
        helper.refresh("example")
        (source / ".workspace-revision").unlink()
        failure(lambda: helper.load("example"), "unavailable-source")
    with fixture() as (_, root, source, helper):
        helper.refresh("example")
        prior = (projection(root) / "example/SKILL.md").read_bytes()
        original = helper.snapshot
        count = 0
        def post_install_change():
            nonlocal count
            count += 1
            if count == 3:
                (source / ".workspace-revision").write_text("new-revision\n")
            return original()
        with patch.object(helper, "snapshot", post_install_change):
            failure(lambda: helper.refresh("example"), "refresh-failed")
        assert (projection(root) / "example/SKILL.md").read_bytes() == prior
    with fixture() as (_, root, source, helper):
        helper.refresh("example")
        original = helper.snapshot
        count = 0
        def changing_load():
            nonlocal count
            count += 1
            if count == 2:
                (source / "example/SKILL.md").write_bytes(b"raced")
            return original()
        with patch.object(helper, "snapshot", changing_load):
            failure(lambda: helper.load("example"), "unavailable-source")
        assert count == 2


def status_read_only():
    with fixture() as (_, root, source, helper):
        mirror(root, helper.snapshot())
        before = snapshot(root), snapshot(source)
        helper.status("example")
        assert before == (snapshot(root), snapshot(source))
        assert not control(root).exists()
        with patch.object(helper.authority, "metadata", lambda _: False):
            failure(lambda: helper.status("example"), "unavailable-helper")
        assert before == (snapshot(root), snapshot(source))
        target = root / ".local/custom_skills/example" / p.SIDECAR
        target.unlink()
        before = snapshot(root), snapshot(source)
        failure(lambda: helper.status("example"), "missing-mirror")
        assert before == (snapshot(root), snapshot(source))
        original = helper.snapshot
        calls = 0
        def drift():
            nonlocal calls
            calls += 1
            if calls == 2:
                (source / ".workspace-revision").write_text("changed")
            return original()
        with patch.object(helper, "snapshot", drift):
            failure(lambda: helper.status("example"), "unavailable-source")
        assert calls == 2


def status_hostile_metadata():
    with fixture() as (base, root, source, helper):
        directory, value = mirror(root, helper.snapshot())
        target = directory / p.SIDECAR
        for bad in (b"\xff", b'{"format":"a","format":"b"}', b"null",
                    p.encode({**value, "extra": 1}), p.encode({**value, "fingerprint": "a" * 64}),
                    p.encode({**value, "skillId": "other"}), p.encode({**value, "sourceRevision": "trimmed"})):
            target.write_bytes(bad)
            before = snapshot(root)
            failure(lambda: helper.status("example"), "mismatch")
            assert before == snapshot(root)
        target.unlink()
        target.symlink_to(source / ".workspace-revision")
        failure(lambda: helper.status("example"), "mismatch")
        target.unlink()
        directory.rmdir()
        directory.symlink_to(source / "example")
        failure(lambda: helper.status("example"), "mismatch")


def ignore_boundaries():
    for name in (".gitignore", ".replitignore"):
        with fixture() as (_, root, source, helper):
            (root / name).write_text("# missing exclusions\n")
            before = snapshot(root)
            failure(lambda: helper.refresh("example"), "invalid-contract")
            assert before == snapshot(root)
    with fixture() as (_, root, source, helper):
        (root / ".replitignore").write_text((root / ".replitignore").read_text() + "!**/SKILL.md\n")
        failure(lambda: helper.refresh("example"), "invalid-contract")
    with fixture() as (_, root, source, helper):
        projection(root).mkdir()
        (projection(root) / "tracked").write_text("not private")
        subprocess.run(["git", "-C", str(root), "add", "-f", str(projection(root) / "tracked")],
                       check=True, capture_output=True)
        failure(lambda: helper.refresh("example"), "invalid-contract")
    with fixture() as (base, root, source, helper):
        outside = base / "outside"
        outside.mkdir()
        control(root).symlink_to(outside)
        # Git itself refuses an ignored path crossing a symlink, so the
        # actual-exclusion guard rejects this before lock acquisition.
        failure(lambda: helper.refresh("example"), "invalid-contract")
        assert list(outside.iterdir()) == []
    with fixture() as (_, root, source, helper):
        with patch.object(disk, "local_filesystem", lambda _: False):
            failure(lambda: helper.refresh("example"), "unavailable-helper")


def persistent_lock():
    with fixture() as (_, root, source, helper):
        helper.refresh("example")
        lock_path = control(root) / "refresh.lock"
        inode = lock_path.stat().st_ino
        lock = os.open(lock_path, os.O_RDWR)
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        before = snapshot(root)
        failure(lambda: helper.refresh("example"), "busy")
        failure(lambda: helper.load("example"), "busy")
        assert before == snapshot(root)
        os.close(lock)
        helper.refresh("example")
        assert lock_path.stat().st_ino == inode
        assert list(control(root).iterdir()) == [lock_path]
        lock_path.unlink()
        lock_path.symlink_to(root / ".gitignore")
        before = (root / ".gitignore").read_bytes()
        failure(lambda: helper.refresh("example"), "busy")
        assert before == (root / ".gitignore").read_bytes()


def owner_recovery():
    with fixture() as (_, root, source, helper):
        helper.refresh("example")
        target = control(root) / "owner.json"
        own = tx.current_owner()
        target.write_bytes(p.encode(own))
        failure(lambda: helper.refresh("example"), "busy")
        own["startTicks"] = str(int(own["startTicks"]) + 1)
        target.write_bytes(p.encode(own))
        helper.refresh("example")
        assert not target.exists()
        target.write_bytes(b"unstructured")
        failure(lambda: helper.refresh("example"), "busy")
        future = time.time() + 1000
        os.utime(target, (future, future))
        failure(lambda: helper.refresh("example"), "busy")
        old = time.time() - 901
        os.utime(target, (old, old))
        helper.refresh("example")
        assert not target.exists()
        own = make_dead()
        (control(root) / ("record-" + own["nonce"] + ".tmp")).write_bytes(p.encode(own))
        helper.refresh("example")
        assert set(os.listdir(control(root))) == {"refresh.lock"}
        assert tx.dead(tx.current_owner()) is False
        # Explicitly exercise unreadable identity for a structured live owner.
        live = tx.current_owner()
        with patch.object(tx, "identity", side_effect=PermissionError):
            assert tx.dead(live) is False


def transaction_recovery():
    for destination in ("absent", "valid", "corrupt"):
        with fixture() as (_, root, source, helper):
            helper.refresh("example")
            own = abandoned(root)
            backup = control(root) / ("backup-" + own["nonce"])
            if destination == "absent":
                projection(root).rename(backup)
            else:
                shutil.copytree(projection(root), backup)
                if destination == "corrupt":
                    (projection(root) / "example/SKILL.md").write_bytes(b"corrupt")
            # Exercise recovery alone under the actual kernel lock.
            with engine.skills_directory(str(root)) as (_, skills):
                with tx.locked(skills, True) as fd:
                    tx.recover(skills, fd, helper.snapshot())
            assert helper.load("example") == {"SKILL.md": b"x\n"}
            assert set(os.listdir(control(root))) == {"refresh.lock"}
    with fixture() as (_, root, source, helper):
        own = abandoned(root, "stage")
        helper.refresh("example")
        assert helper.load("example") == {"SKILL.md": b"x\n"}
    with fixture() as (_, root, source, helper):
        helper.refresh("example")
        # Kill a real lock-holder after durable backup publication. Linux
        # releases flock; same-host process identity then establishes death.
        code = """
import os, sys, time
sys.path.insert(0, sys.argv[1])
import engine, transactions as tx, safe_fs as disk
from protocol import FORMAT
with engine.skills_directory(sys.argv[2]) as (_, skills):
    with tx.locked(skills, True) as fd:
        own = tx.current_owner()
        tx.atomic_record(fd, 'owner.json', own, own)
        name = 'transaction-' + own['nonce'] + '.json'
        tx.atomic_record(fd, name, {'format': FORMAT, 'nonce': own['nonce'], 'owner': own}, own)
        disk.rename(skills, tx.DESTINATION, fd, 'backup-' + own['nonce'])
        print('ready', flush=True)
        time.sleep(10)
"""
        child = subprocess.Popen(["python3", "-B", "-c", code,
                                  str(REPOSITORY / "scripts/workspace_skill_sync"), str(root)],
                                 stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        try:
            import select
            assert select.select([child.stdout], [], [], 3)[0], "child-not-ready"
            assert child.stdout.readline() == b"ready\n"
            failure(lambda: helper.refresh("example"), "busy")
        finally:
            child.kill()
            child.communicate(timeout=3)
        helper.refresh("example")
        assert helper.load("example") == {"SKILL.md": b"x\n"}
        assert set(os.listdir(control(root))) == {"refresh.lock"}


def uncertain_artifacts():
    for name, data in (("stage-not-a-uuid", None), ("transaction-invalid.json", b"{}"),
                       ("record-" + str(uuid.uuid4()) + ".tmp", b"{}"), ("unknown", b"x")):
        with fixture() as (_, root, source, helper):
            helper.refresh("example")
            file = control(root) / name
            file.mkdir() if data is None else file.write_bytes(data)
            before = snapshot(root)
            failure(lambda: helper.refresh("example"), "busy")
            assert before == snapshot(root)
    with fixture() as (_, root, source, helper):
        helper.refresh("example")
        own = abandoned(root, "stage")
        backup = control(root) / ("backup-" + own["nonce"])
        shutil.copytree(projection(root), backup)
        (projection(root) / "example/SKILL.md").write_bytes(b"corrupt")
        before = snapshot(root)
        failure(lambda: helper.refresh("example"), "refresh-failed")
        assert before == snapshot(root)
    with fixture() as (_, root, source, helper):
        helper.refresh("example")
        own = abandoned(root, "stage")
        (control(root) / ("stage-" + own["nonce"]) / "link").symlink_to(source)
        before = snapshot(root)
        failure(lambda: helper.refresh("example"), "busy")
        assert before == snapshot(root)
    with fixture() as (_, root, source, helper):
        helper.refresh("example")
        abandoned(root, "stage", tx.current_owner())
        before = snapshot(root)
        failure(lambda: helper.refresh("example"), "busy")
        assert before == snapshot(root)


def rollback():
    with fixture() as (_, root, source, helper):
        helper.refresh("example")
        (source / ".workspace-revision").write_text("new\n")
        (source / "example/SKILL.md").write_bytes(b"new\n")
        original = disk.rename
        failed = False
        def fail_install(sfd, source_name, dfd, destination, replace=False):
            nonlocal failed
            if source_name.startswith("stage-") and destination == tx.DESTINATION and not failed:
                failed = True
                raise OSError("fixture-install-failure")
            return original(sfd, source_name, dfd, destination, replace)
        with patch.object(disk, "rename", fail_install):
            failure(lambda: helper.refresh("example"), "refresh-failed")
        assert (projection(root) / "example/SKILL.md").read_bytes() == b"x\n"
        assert set(os.listdir(control(root))) == {"refresh.lock"}
        failure(lambda: helper.load("example"))
        helper.refresh("example")
        assert helper.load("example") == {"SKILL.md": b"new\n"}
    with fixture() as (_, root, source, helper):
        helper.refresh("example")
        original = disk.rename
        def fail_backup_flush(sfd, source_name, dfd, destination, replace=False):
            original(sfd, source_name, dfd, destination, replace)
            if source_name == tx.DESTINATION and destination.startswith("backup-"):
                raise OSError("fixture-parent-flush-failure")
        with patch.object(disk, "rename", fail_backup_flush):
            failure(lambda: helper.refresh("example"), "refresh-failed")
        assert helper.load("example") == {"SKILL.md": b"x\n"}
        assert set(os.listdir(control(root))) == {"refresh.lock"}


def rollback_uncertainty():
    with fixture() as (_, root, source, helper):
        helper.refresh("example")
        original = disk.rename
        def fail_both(sfd, source_name, dfd, destination, replace=False):
            if source_name.startswith(("stage-", "backup-")) and destination == tx.DESTINATION:
                raise OSError("fixture-rename-failure")
            return original(sfd, source_name, dfd, destination, replace)
        with patch.object(disk, "rename", fail_both):
            failure(lambda: helper.refresh("example"), "refresh-failed")
        backups = list(control(root).glob("backup-*"))
        assert len(backups) == 1 and (backups[0] / "example/SKILL.md").read_bytes() == b"x\n"
        assert list(control(root).glob("transaction-*.json"))
        assert list(control(root).glob("stage-*"))
        assert not projection(root).exists()
        # Real process would have died. Make retained transaction provably dead
        # in this isolated recovery fixture, never in a live project.
        transaction = next(control(root).glob("transaction-*.json"))
        value = p.parse(transaction.read_bytes())
        value["owner"]["bootId"] = make_dead()["bootId"]
        transaction.write_bytes(p.encode(value))
        helper.refresh("example")
        assert helper.load("example") == {"SKILL.md": b"x\n"}


def no_platform_authority():
    with fixture() as (_, root, source, helper):
        untrusted = engine.Helper(str(root), str(source))
        before = snapshot(root)
        failure(lambda: untrusted.refresh("example"), "unavailable-source")
        failure(lambda: untrusted.load("example"), "unavailable-source")
        assert before == snapshot(root)
        mirror(root, helper.snapshot())
        no_metadata = FixtureAuthority()
        no_metadata.metadata = lambda _: False
        failure(lambda: engine.Helper(str(root), str(source), no_metadata).status("example"), "unavailable-helper")
        # A matching locally authored sidecar is insufficient authority.
        assert not engine.Authority().metadata(p.FORMAT)
        assert not engine.Authority().publication(str(source))


def fixture_only_writes():
    # Roots, source, mirror and all mutating/recovery injections are temporary.
    # Every mutation's open directory descriptor must resolve inside the
    # disposable root. Real private skill/mirror bodies are never read here.
    with fixture() as (_, root, source, helper):
        source_before = snapshot(source)
        authored_before = snapshot(root / ".agents/skills/authored")
        mirror(root, helper.snapshot())
        mirror_before = snapshot(root / ".local")
        writes = []
        originals = {name: getattr(disk, name) for name in ("mkdir", "write", "rename", "remove_file", "remove_tree")}
        def guarded(name):
            def invoke(parent, *args, **kwargs):
                actual = Path(os.readlink(f"/proc/self/fd/{parent}"))
                assert actual.is_relative_to(root)
                if name == "rename":
                    destination_parent = Path(os.readlink(f"/proc/self/fd/{args[1]}"))
                    assert destination_parent.is_relative_to(root)
                writes.append(name)
                return originals[name](parent, *args, **kwargs)
            return invoke
        from contextlib import ExitStack
        with ExitStack() as stack:
            for name in originals:
                stack.enter_context(patch.object(disk, name, guarded(name)))
            helper.refresh("example")
            helper.load("example")
            helper.status("example")
        assert writes
        assert source_before == snapshot(source)
        assert authored_before == snapshot(root / ".agents/skills/authored")
        assert mirror_before == snapshot(root / ".local")


globals()[CASE]()
print("fixture-pass")
