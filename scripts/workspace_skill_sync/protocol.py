"""workspace-skill/v1 values. No platform authority is inferred from local files."""
import hashlib
import json
import re
import struct

FORMAT = "workspace-skill/v1"
MANIFEST = ".workspace-manifest.json"
SIDECAR = ".workspace-skill-metadata.json"
SLUG = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*", re.ASCII)
UUID4 = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}")
UUID = re.compile(r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}")
MAX_BYTES = 9007199254740991


class Failure(Exception):
    def __init__(self, outcome, reason):
        self.outcome, self.reason = outcome, reason
        super().__init__(reason)


def require(ok, reason="invalid-data"):
    if not ok:
        raise ValueError(reason)


def skill_id(value):
    return isinstance(value, str) and 1 <= len(value) <= 64 and SLUG.fullmatch(value) is not None


def utf8(value):
    return value.encode("utf-8", errors="strict")


def relative(value):
    require(isinstance(value, str) and value and not value.startswith("/"))
    utf8(value)
    require("\\" not in value and all(ord(c) >= 32 and not 127 <= ord(c) <= 159 for c in value))
    require(all(p not in ("", ".", "..") for p in value.split("/")))
    return value


def ordered(values):
    return sorted(values, key=utf8)


def fingerprint(files):
    digest = hashlib.sha256(FORMAT.encode("ascii") + b"\0")
    for name in ordered(files):
        data, encoded = files[name], utf8(relative(name))
        digest.update(struct.pack(">Q", len(encoded)))
        digest.update(encoded)
        digest.update(struct.pack(">Q", len(data)))
        digest.update(data)
    return digest.hexdigest()


def pairs(items):
    result = {}
    for key, value in items:
        require(key not in result, "duplicate-key")
        result[key] = value
    return result


def parse(data):
    return json.loads(data.decode("utf-8", errors="strict"), object_pairs_hook=pairs,
                      parse_constant=lambda _: require(False))


def encode(value):
    return (json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")


def fields(value, keys):
    require(type(value) is dict and set(value) == set(keys))


def revision(value):
    require(type(value) is str and bool(value.strip()))
    utf8(value)


def digest(value):
    require(type(value) is str and re.fullmatch("[0-9a-f]{64}", value) is not None)


def manifest(value):
    fields(value, ("format", "sourceRevision", "skills"))
    require(value["format"] == FORMAT)
    revision(value["sourceRevision"])
    require(type(value["skills"]) is list)
    ids = []
    for item in value["skills"]:
        fields(item, ("id", "files", "fingerprint"))
        require(skill_id(item["id"]))
        ids.append(item["id"])
        digest(item["fingerprint"])
        require(type(item["files"]) is list and item["files"])
        names = []
        for file in item["files"]:
            fields(file, ("path", "bytes"))
            names.append(relative(file["path"]))
            require(file["path"] != SIDECAR)
            require(type(file["bytes"]) is int and 0 <= file["bytes"] <= MAX_BYTES)
        require(names == ordered(set(names)) and "SKILL.md" in names)
    require(ids == ordered(set(ids)))
    return value


def sidecar(value):
    fields(value, ("format", "skillId", "sourceRevision", "fingerprint"))
    require(value["format"] == FORMAT and skill_id(value["skillId"]))
    revision(value["sourceRevision"])
    digest(value["fingerprint"])
    return value


def owner(value):
    fields(value, ("format", "nonce", "pid", "bootId", "startTicks", "createdAtMs"))
    require(value["format"] == FORMAT and type(value["nonce"]) is str and UUID4.fullmatch(value["nonce"]))
    require(type(value["pid"]) is int and value["pid"] > 0)
    require(type(value["bootId"]) is str and UUID.fullmatch(value["bootId"]))
    require(type(value["startTicks"]) is str and re.fullmatch("[0-9]+", value["startTicks"]))
    require(type(value["createdAtMs"]) is int and value["createdAtMs"] >= 0)
    return value


def transaction(value):
    fields(value, ("format", "nonce", "owner"))
    require(value["format"] == FORMAT and value["nonce"] == owner(value["owner"])["nonce"])
    return value
