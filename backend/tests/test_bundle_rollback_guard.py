"""AlmaMesh's own proof that bundle promotion refuses a rollback it cannot disprove.

``almamesh.edge.bundle.sync_constructs`` promises, in its own docstring, that a
sync is *fail-closed*: "a bad signature or integrity check raises, never
downgrades". That promise is delegated wholesale to ``edge-proc``'s
``FilesystemCacheStore.promote``, so it is only true if the version of edge-proc
almamesh actually installs refuses a promote it cannot prove is fresh.

Until edge-proc 0.3.0 it did not, and this repo shipped a vendored 0.1.4 snapshot
whose own suite asserted the hole as the requirement:

    # backend/vendor/edge-proc/tests/bundles/test_cas.py (deleted with the vendor dir)
    def test_promote_allows_unparseable_version_covenant(tmp_path: Path) -> None:
        # Covenant: the anti-rollback guard must NEVER reject a validly-signed bundle.
        # ... the promote must still succeed (fail-OPEN), never fail-closed on the guard.
        store.promote(weird_ptr)  # unparseable version -> cannot prove downgrade -> allowed

    def test_promote_allows_equal_and_forward_versions(tmp_path: Path) -> None:
        store.promote(p_b)  # equal version, different content -> allowed

**That covenant is reversed here, deliberately.** A signature proves *authorship*,
never *freshness*, and a replayed pointer is validly signed by construction — so
"I cannot tell whether this is a rollback" must REJECT. These tests are the
inversion of the two above, owned by almamesh rather than inherited from a
vendored snapshot, and they fail on any edge-proc older than 0.3.0.
"""

from __future__ import annotations

import hashlib
from pathlib import Path

import pytest
from edgeproc.bundles.cas import FilesystemCacheStore, IntegrityError, RollbackError
from edgeproc.bundles.manifest import (
    ChunkRef,
    FileEntry,
    IndexManifest,
    VersionPointer,
    canonical_bytes,
)

_BUNDLE_ID = "almamesh-constructs"


def _pointer(store: FilesystemCacheStore, payload: bytes, version: str) -> VersionPointer:
    """A signed-shaped pointer at ``version`` whose manifest really is in ``store``."""
    chunk_hash = store.put_chunk(payload)
    manifest = IndexManifest(
        bundle_id=_BUNDLE_ID,
        version=version,
        files=[
            FileEntry(
                path="constructs/lahiri_ayanamsa.json",
                size=len(payload),
                file_sha256=hashlib.sha256(payload).hexdigest(),
                chunks=[ChunkRef(hash=chunk_hash, size=len(payload))],
            )
        ],
    )
    return VersionPointer(
        manifest_hash=store.put_manifest(canonical_bytes(manifest)),
        version=version,
        signature="not-checked-by-promote",
    )


def test_promote_refuses_a_replayed_pointer_at_an_equal_version(tmp_path: Path) -> None:
    """The live-exploitable case: a genuinely-signed re-publish at the SAME label.

    ``Version("1.2.0") < Version("1.2.0")`` is ``False``. Reading that one ``False``
    as affirmative proof of freshness let an attacker replay the earlier, validly
    signed ``1.2.0`` pointer over the later one, moving a device's content backwards
    under an unchanged version string. No forgery required.
    """
    store = FilesystemCacheStore(tmp_path / "cache")
    store.promote(_pointer(store, b"newer constructs" * 8, "1.2.0"))

    replayed = _pointer(store, b"older constructs" * 8, "1.2.0")

    with pytest.raises(RollbackError):
        store.promote(replayed)


def test_promote_refuses_a_version_pep440_cannot_compare(tmp_path: Path) -> None:
    """No comparable version is *not* a proof of freshness — it is the absence of one."""
    store = FilesystemCacheStore(tmp_path / "cache")
    store.promote(_pointer(store, b"active constructs" * 8, "2.0.0"))

    unparseable = _pointer(store, b"incoming constructs" * 8, "not-a-semver")

    with pytest.raises(RollbackError):
        store.promote(unparseable)


def test_an_unreadable_active_pointer_does_not_answer_nothing_was_promoted(
    tmp_path: Path,
) -> None:
    """The second hole: the one answer that makes the guard skip itself.

    ``read_active()`` returning ``None`` means "nothing has ever been promoted",
    which is exactly the state that tells the anti-rollback guard it has nothing to
    be fresher than. An ``active`` entry that exists but cannot be read as a pointer
    must therefore be a refusal, not a ``None`` — measured on the vendored 0.1.4 this
    repo shipped, a *directory* named ``active`` returned ``None`` and the promote
    then needed no proof at all.
    """
    cache = tmp_path / "cache"
    store = FilesystemCacheStore(cache)
    cache.mkdir(parents=True, exist_ok=True)
    (cache / "active").mkdir()

    with pytest.raises(IntegrityError):
        store.read_active()


def test_promote_still_allows_a_forward_version_bump(tmp_path: Path) -> None:
    """Fail-closed must not mean fail-always: a provably newer bundle still installs."""
    store = FilesystemCacheStore(tmp_path / "cache")
    store.promote(_pointer(store, b"v1 constructs" * 8, "1.2.0"))

    newer = _pointer(store, b"v2 constructs" * 8, "1.3.0")
    store.promote(newer)

    assert store.read_active() == newer


def test_first_promote_has_nothing_to_be_fresher_than(tmp_path: Path) -> None:
    """A cold device must be able to install its first bundle."""
    store = FilesystemCacheStore(tmp_path / "cache")

    first = _pointer(store, b"first constructs" * 8, "not-a-semver")
    store.promote(first)

    assert store.read_active() == first
