"""Trusted host boundary, deliberately unavailable until the platform wires it.

Do not replace these functions with environment booleans, caller JSON, a source
marker, or a locally authored runtime sidecar. Those cannot attest publication
or platform metadata authority. Isolated tests inject fixture capabilities in
memory; the production CLI has no override flag or configurable module loader.
"""


def immutable_publication(source_root):
    return False


def authoritative_sidecar(format_version):
    return False
