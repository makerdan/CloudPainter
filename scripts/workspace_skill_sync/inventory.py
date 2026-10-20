"""Complete source and projection validation; bytes never become instructions."""
import os
import stat

import safe_fs as disk
from protocol import (FORMAT, MANIFEST, SIDECAR, MAX_BYTES, Failure, encode, fingerprint,
                      manifest, ordered, parse, require, revision, skill_id)


def source_snapshot(source, publication):
    if not source:
        raise Failure("unavailable-source", "source-unavailable")
    try:
        with disk.absolute_directory(source) as root:
            if publication(source) is not True:
                raise Failure("unavailable-source", "publication-unattested")
            names = ordered(os.listdir(root))
            require(".workspace-revision" in names)
            text = disk.read(root, ".workspace-revision").decode("utf-8", errors="strict")
            revision(text)
            skills, payload = [], {}
            for name in names:
                if name == ".workspace-revision":
                    continue
                require(skill_id(name))
                with disk.directory(name, root) as child:
                    files = disk.tree(child)
                require("SKILL.md" in files and SIDECAR not in files)
                require(all(len(data) <= MAX_BYTES for data in files.values()))
                skills.append({"id": name, "files": [{"path": p, "bytes": len(files[p])}
                               for p in ordered(files)], "fingerprint": fingerprint(files)})
                payload.update({name + "/" + p: data for p, data in files.items()})
            result = {"format": FORMAT, "sourceRevision": text, "skills": skills}
            manifest(result)
            return result, payload
    except Failure:
        raise
    except Exception:
        raise Failure("unavailable-source", "source-invalid") from None


def projection(parent, name, snapshot):
    expected, payload = snapshot
    with disk.directory(name, parent) as fd:
        files = disk.tree(fd)
    require(MANIFEST in files)
    actual = manifest(parse(files.pop(MANIFEST)))
    require(actual == expected and files == payload, "projection-invalid")
    return files


def stage(parent, name, snapshot):
    expected, payload = snapshot
    disk.mkdir(parent, name)
    with disk.directory(name, parent) as fd:
        disk.write_tree(fd, {**payload, MANIFEST: encode(expected)})
    projection(parent, name, snapshot)


def safe_snapshot(parent, name):
    entry = disk.info(parent, name)
    if entry is None:
        return
    require(stat.S_ISDIR(entry.st_mode), "unsafe-snapshot")
    with disk.directory(name, parent) as fd:
        require(os.fstat(fd).st_dev == os.fstat(parent).st_dev)
        disk.tree(fd, allow_empty=True)
