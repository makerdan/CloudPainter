"""Descriptor-relative Linux filesystem operations; never follow symlinks."""
import ctypes
import os
import stat
from contextlib import contextmanager

from protocol import relative, require, ordered

DIRECTORY = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
REGULAR = os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC | os.O_NONBLOCK


@contextmanager
def directory(name, parent=None):
    fd = os.open(name, DIRECTORY, dir_fd=parent)
    try:
        require(os.fstat(fd).st_mode & 0o555)
        yield fd
    finally:
        os.close(fd)


@contextmanager
def absolute_directory(name):
    require(isinstance(name, str) and name and "\0" not in name)
    # Reject ambiguous spelling rather than silently normalizing it.
    if not name.startswith("/"):
        name = os.getcwd() + "/" + name
    pieces = name.split("/")[1:]
    require(all(p not in ("", ".", "..") for p in pieces))
    fd = os.open("/", DIRECTORY)
    try:
        for piece in pieces:
            next_fd = os.open(piece, DIRECTORY, dir_fd=fd)
            os.close(fd)
            fd = next_fd
        yield fd
    finally:
        os.close(fd)


def info(parent, name):
    try:
        return os.stat(name, dir_fd=parent, follow_symlinks=False)
    except FileNotFoundError:
        return None


def regular_info(parent, name):
    value = info(parent, name)
    if value is None:
        raise FileNotFoundError()
    require(stat.S_ISREG(value.st_mode) and value.st_mode & 0o444)
    return value


def read(parent, name):
    regular_info(parent, name)
    fd = os.open(name, REGULAR, dir_fd=parent)
    try:
        value = os.fstat(fd)
        require(stat.S_ISREG(value.st_mode) and value.st_mode & 0o444)
        with os.fdopen(fd, "rb", closefd=False) as stream:
            return stream.read()
    finally:
        os.close(fd)


def tree(parent, allow_empty=False):
    result = {}

    def visit(fd, prefix=""):
        entries = ordered(os.listdir(fd))
        require(allow_empty or entries, "empty-directory")
        for name in entries:
            relative(name)
            full = prefix + name
            entry = info(fd, name)
            require(entry is not None)
            if stat.S_ISDIR(entry.st_mode):
                with directory(name, fd) as child:
                    visit(child, full + "/")
            else:
                result[full] = read(fd, name)
    visit(parent)
    return result


def sync(fd):
    os.fsync(fd)


def mkdir(parent, name):
    relative(name)
    require("/" not in name)
    os.mkdir(name, 0o700, dir_fd=parent)
    sync(parent)


def write(parent, name, data):
    fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC,
                 0o600, dir_fd=parent)
    try:
        with os.fdopen(fd, "wb", closefd=False) as stream:
            stream.write(data)
            stream.flush()
            os.fsync(fd)
    finally:
        os.close(fd)
    sync(parent)


def write_tree(parent, files):
    for name in ordered(files):
        pieces = relative(name).split("/")
        fd = os.dup(parent)
        try:
            for piece in pieces[:-1]:
                if info(fd, piece) is None:
                    mkdir(fd, piece)
                next_fd = os.open(piece, DIRECTORY, dir_fd=fd)
                os.close(fd)
                fd = next_fd
            write(fd, pieces[-1], files[name])
        finally:
            os.close(fd)


def rename(source_fd, source, destination_fd, destination, replace=False):
    if replace:
        os.rename(source, destination, src_dir_fd=source_fd, dst_dir_fd=destination_fd)
    else:
        # RENAME_NOREPLACE guards against colliding artifacts, even under races.
        libc = ctypes.CDLL(None, use_errno=True)
        renameat2 = libc.renameat2
        renameat2.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
        renameat2.restype = ctypes.c_int
        if renameat2(source_fd, os.fsencode(source), destination_fd, os.fsencode(destination), 1):
            err = ctypes.get_errno()
            raise OSError(err, "rename-failed")
    sync(source_fd)
    if source_fd != destination_fd:
        sync(destination_fd)


def remove_file(parent, name):
    regular_info(parent, name)
    os.unlink(name, dir_fd=parent)
    sync(parent)


def remove_tree(parent, name):
    # Validate the complete snapshot before deleting anything. Re-open every
    # component without following links during removal too.
    with directory(name, parent) as fd:
        tree(fd, allow_empty=True)
        for child in os.listdir(fd):
            entry = info(fd, child)
            if stat.S_ISDIR(entry.st_mode):
                remove_tree(fd, child)
            else:
                remove_file(fd, child)
    os.rmdir(name, dir_fd=parent)
    sync(parent)


def local_filesystem(fd):
    # Linux statfs: f_type is the first native long. Fail closed on unknown
    # filesystems, notably NFS/CIFS/FUSE. A mount cannot be attested by a flag.
    result = ctypes.create_string_buffer(256)
    libc = ctypes.CDLL(None, use_errno=True)
    require(libc.fstatfs(fd, result) == 0)
    kind = ctypes.c_long.from_buffer(result).value & 0xFFFFFFFF
    return kind in {0xEF53, 0x01021994, 0x794C7630, 0x58465342, 0x9123683E, 0x2FC12FC1}
