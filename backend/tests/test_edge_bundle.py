"""Signed content-addressed delivery of AlmaMesh constructs.

almamesh.com is delivery-only: it serves a signed pointer + immutable chunks.
The device verifies the ed25519 signature against a pinned trust-root key and
fails closed on any mismatch. Compute never leaves the device.
"""

import pytest
from edgeproc.bundles.signing import (
    Ed25519Signer,
    Ed25519Verifier,
    SignatureError,
    generate_keypair,
)

from almamesh.edge.bundle import (
    gather_construct_files,
    publish_constructs,
    sync_constructs,
)


def _verifier(public_key: object) -> Ed25519Verifier:
    return Ed25519Verifier.from_public_bytes(public_key.public_bytes_raw())  # type: ignore[attr-defined]


def test_publish_then_sync_round_trip(tmp_path) -> None:
    private_key, public_key = generate_keypair()
    publish_constructs(
        {"data.txt": b"hello almamesh"},
        tmp_path / "origin",
        Ed25519Signer(private_key),
        version="1.0.0",
    )
    result = sync_constructs(str(tmp_path / "origin"), tmp_path / "cache", _verifier(public_key))
    assert result.chunks_fetched >= 1


def test_sync_fails_closed_on_wrong_trust_root(tmp_path) -> None:
    private_key, _ = generate_keypair()
    _, wrong_public_key = generate_keypair()
    publish_constructs(
        {"data.txt": b"x"}, tmp_path / "origin", Ed25519Signer(private_key), version="1.0.0"
    )
    with pytest.raises(SignatureError):
        sync_constructs(str(tmp_path / "origin"), tmp_path / "cache", _verifier(wrong_public_key))


def test_gather_construct_files_includes_ayanamsa_table() -> None:
    files = gather_construct_files()
    assert "lahiri_ayanamsa.txt" in files
    assert len(files["lahiri_ayanamsa.txt"]) > 0
