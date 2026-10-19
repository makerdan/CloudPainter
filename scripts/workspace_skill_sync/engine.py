"""Repository helper API. No operation writes the platform-owned runtime mirror."""
import os
import subprocess
from contextlib import contextmanager

import platform_authority
import safe_fs as disk
from inventory import projection, safe_snapshot, source_snapshot, stage
from protocol import FORMAT, SIDECAR, Failure, parse, require, sidecar, skill_id
from transactions import (CONTROL, DESTINATION, atomic_record, current_owner,
                          inspect_abandoned, locked, recover, remove_owner)

BOUNDARIES = (".agents/skills/" + DESTINATION, ".agents/skills/" + CONTROL)


class Authority:
    """Only trusted integration code may implement these capabilities."""
    publication = staticmethod(platform_authority.immutable_publication)
    metadata = staticmethod(platform_authority.authoritative_sidecar)


def boundaries(root, root_fd):
    try:
        # Deployment exclusions are deliberately a strict supported subset of
        # dockerignore: terminal literal directory exclusions, no later rules.
        deployment = disk.read(root_fd, ".replitignore").decode("utf-8")
        rules = [s.strip() for s in deployment.splitlines() if s.strip() and not s.lstrip().startswith("#")]
        expected = ["/" + p + "/" for p in BOUNDARIES]
        require(rules[-2:] == expected, "deployment-exclusions-required")
        disk.read(root_fd, ".gitignore")
        env = {k: os.environ[k] for k in ("PATH", "HOME") if k in os.environ}
        env.update({"GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": "/dev/null"})
        for value in BOUNDARIES:
            tracked = subprocess.run(["git", "-C", root, "ls-files", "-z", "--", value],
                                     capture_output=True, timeout=5, env=env)
            require(tracked.returncode == 0 and not tracked.stdout)
            for probe in (value + "/", value + "/nested/fixture"):
                result = subprocess.run(["git", "-C", root, "-c", "core.excludesFile=/dev/null",
                                         "check-ignore", "--no-index", "-q", "--", probe],
                                        capture_output=True, timeout=5, env=env)
                require(result.returncode == 0)
    except Exception:
        raise Failure("invalid-contract", "exclusions-required") from None


@contextmanager
def skills_directory(root):
    with disk.absolute_directory(root) as fd:
        with disk.directory(".agents", fd) as agents:
            with disk.directory("skills", agents) as skills:
                yield fd, skills


class Helper:
    def __init__(self, root, source=None, authority=None):
        self.root = os.fspath(root)
        # No inferred default, mirror, canonical package or archive source.
        self.source = source if source is not None else os.environ.get("WORKSPACE_SKILLS_SOURCE")
        self.authority = authority or Authority()

    def snapshot(self):
        return source_snapshot(self.source, self.authority.publication)

    def requested(self, snapshot, requested, status=False):
        if not any(item["id"] == requested for item in snapshot[0]["skills"]):
            raise Failure("unavailable-source" if status else "missing-skill", "skill-absent")

    def second(self, initial, outcome):
        try:
            require(self.snapshot() == initial)
        except Exception:
            raise Failure(outcome, "source-changed") from None

    def refresh(self, requested):
        require(skill_id(requested))
        snapshot = self.snapshot()
        self.requested(snapshot, requested)
        with skills_directory(self.root) as (root, skills):
            boundaries(self.root, root)
            with locked(skills, create=True) as control:
                recover(skills, control, snapshot)
                own = current_owner()
                # owner.json replacement is allowed only after dead-owner recovery.
                atomic_record(control, "owner.json", own, own)
                nonce = own["nonce"]
                record = "transaction-" + nonce + ".json"
                staging, backup = "stage-" + nonce, "backup-" + nonce
                preserve = False
                recorded = False
                try:
                    atomic_record(control, record, {"format": FORMAT, "nonce": nonce, "owner": own}, own)
                    recorded = True
                    stage(control, staging, snapshot)
                    self.second(snapshot, "refresh-failed")
                    safe_snapshot(skills, DESTINATION)
                    try:
                        if disk.info(skills, DESTINATION) is not None:
                            disk.rename(skills, DESTINATION, control, backup)
                        disk.rename(control, staging, skills, DESTINATION)
                        projection(skills, DESTINATION, snapshot)
                        self.second(snapshot, "refresh-failed")
                    except Exception:
                        # If installation succeeded but validation failed, move
                        # it back before restoring the intact previous snapshot.
                        try:
                            # A failed move-to-backup may leave the old
                            # destination intact; do not quarantine/delete it.
                            if (disk.info(skills, DESTINATION) is not None
                                    and disk.info(control, staging) is None):
                                require(disk.info(control, staging) is None)
                                disk.rename(skills, DESTINATION, control, staging)
                            if disk.info(control, backup) is not None:
                                disk.rename(control, backup, skills, DESTINATION)
                        except Exception:
                            preserve = True
                        raise Failure("refresh-failed", "installation-failed") from None
                except Failure:
                    raise
                except Exception:
                    raise Failure("refresh-failed", "refresh-failed") from None
                finally:
                    # Cleanup failures preserve transaction evidence for recovery.
                    try:
                        if recorded and not preserve:
                            for name in (staging, backup):
                                if disk.info(control, name) is not None:
                                    disk.remove_tree(control, name)
                            if disk.info(control, record) is not None:
                                disk.remove_file(control, record)
                    finally:
                        remove_owner(control, own)

    def load(self, requested, files=None):
        """Read bytes under the SAME exclusive refresh lock; never execute them.

        No refresh is performed implicitly. A caller receives only requested
        manifested regular files, and nothing if the source/projection is stale.
        """
        try:
            return self._load(requested, files)
        except Failure:
            raise
        except Exception:
            raise Failure("invalid-contract", "projection-invalid") from None

    def _load(self, requested, files):
        require(skill_id(requested))
        snapshot = self.snapshot()
        self.requested(snapshot, requested)
        with skills_directory(self.root) as (_, skills):
            with locked(skills, create=False) as control:
                # Loading must not recover, clear owners or accept abandoned work.
                records, temps = inspect_abandoned(control)
                require(not records and not temps and disk.info(control, "owner.json") is None)
                payload = projection(skills, DESTINATION, snapshot)
                self.second(snapshot, "unavailable-source")
                prefix = requested + "/"
                selected = {p[len(prefix):]: data for p, data in payload.items() if p.startswith(prefix)}
                if files is not None:
                    require(type(files) is list and len(files) == len(set(files)))
                    require(all(type(p) is str and p in selected for p in files))
                    selected = {p: selected[p] for p in files}
                return selected

    def status(self, requested):
        require(skill_id(requested))
        snapshot = self.snapshot()
        try:
            self.requested(snapshot, requested, status=True)
            try:
                attested = self.authority.metadata(FORMAT) is True
            except Exception:
                attested = False
            if not attested:
                raise Failure("unavailable-helper", "metadata-unattested")
            with disk.absolute_directory(self.root) as root:
                with disk.directory(".local", root) as local:
                    with disk.directory("custom_skills", local) as mirrors:
                        with disk.directory(requested, mirrors) as mirror:
                            try:
                                actual = sidecar(parse(disk.read(mirror, SIDECAR)))
                            except FileNotFoundError:
                                raise Failure("missing-mirror", "mirror-absent") from None
                            except Exception:
                                if disk.info(mirror, SIDECAR) is None:
                                    raise Failure("missing-mirror", "mirror-absent") from None
                                raise Failure("mismatch", "metadata-invalid") from None
            item = next(s for s in snapshot[0]["skills"] if s["id"] == requested)
            expected = {"format": FORMAT, "skillId": requested,
                        "sourceRevision": snapshot[0]["sourceRevision"], "fingerprint": item["fingerprint"]}
            if actual != expected:
                raise Failure("mismatch", "metadata-mismatch")
        except FileNotFoundError:
            failure = Failure("missing-mirror", "mirror-absent")
        except Failure as error:
            failure = error
        except Exception:
            failure = Failure("mismatch", "mirror-invalid")
        else:
            failure = None
        # A second complete read happens on ALL status metadata outcomes.
        self.second(snapshot, "unavailable-source")
        if failure:
            raise failure
