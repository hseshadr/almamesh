"""P1 bundle publisher: provenance metadata + full construct staging.

The publisher gathers the engine's data constructs (the Lahiri table),
records provenance in a signed ``almamesh_meta.json``, optionally stages large
binaries (ephemeris, wheels) from a staging dir, and ships the lot as one
signed content-addressed bundle. The consumer syncs it fail-closed and reads
files back byte-for-byte.
"""

import json
import os
import stat

import pytest
from edgeproc.bundles.signing import (
    Ed25519Signer,
    Ed25519Verifier,
    SignatureError,
    generate_keypair,
)

from almamesh.edge.bundle import (
    BundleMeta,
    build_meta,
    gather_construct_files,
    generate_keypair_files,
    publish_bundle,
    read_synced_file,
    sync_constructs,
)


def _verifier(public_key: object) -> Ed25519Verifier:
    return Ed25519Verifier.from_public_bytes(public_key.public_bytes_raw())  # type: ignore[attr-defined]


# --- provenance metadata --------------------------------------------------


def test_build_meta_records_engine_ephemeris_and_ayanamsa() -> None:
    meta = build_meta(
        version="2.0.0",
        constructs=["lahiri_ayanamsa.txt"],
        ephemeris_file="de421.bsp",
    )
    assert isinstance(meta, BundleMeta)
    assert meta.version == "2.0.0"
    assert meta.ephemeris_file == "de421.bsp"
    assert meta.ayanamsa == "lahiri"
    assert meta.engine_version  # resolved from the installed package, non-empty
    assert "lahiri_ayanamsa.txt" in meta.constructs


# --- expanded construct gathering ----------------------------------------


def test_gather_construct_files_includes_lahiri_table() -> None:
    files = gather_construct_files()
    assert "lahiri_ayanamsa.txt" in files
    # The old YAML yoga catalog is gone: rules are code in the almamesh wheel.
    assert all("yoga" not in name for name in files)
    assert all(len(blob) > 0 for blob in files.values())


# --- full publish → sync round trip --------------------------------------


def test_publish_bundle_ships_constructs_and_signed_meta(tmp_path) -> None:
    private_key, public_key = generate_keypair()
    origin, cache = tmp_path / "origin", tmp_path / "cache"

    publish_bundle(
        origin,
        Ed25519Signer(private_key),
        version="1.0.0",
        ephemeris_file="de421.bsp",
    )
    result = sync_constructs(str(origin), cache, _verifier(public_key))

    # constructs arrive byte-identical
    lahiri = read_synced_file(cache, result, "lahiri_ayanamsa.txt")
    assert len(lahiri) > 0

    # provenance manifest is part of the signed bundle
    meta = json.loads(read_synced_file(cache, result, "almamesh_meta.json"))
    assert meta["ephemeris_file"] == "de421.bsp"
    assert meta["version"] == "1.0.0"
    assert "lahiri_ayanamsa.txt" in meta["constructs"]


def test_publish_bundle_stages_extra_binaries(tmp_path) -> None:
    private_key, public_key = generate_keypair()
    origin, cache = tmp_path / "origin", tmp_path / "cache"
    staging = tmp_path / "staging"
    (staging / "wheels").mkdir(parents=True)
    (staging / "de421.bsp").write_bytes(b"EPHEMERIS-BINARY")
    (staging / "wheels" / "almamesh-0.1.0-py3-none-any.whl").write_bytes(b"WHEEL-BYTES")

    publish_bundle(origin, Ed25519Signer(private_key), version="1.0.0", staging_dir=staging)
    result = sync_constructs(str(origin), cache, _verifier(public_key))

    assert read_synced_file(cache, result, "de421.bsp") == b"EPHEMERIS-BINARY"
    assert (
        read_synced_file(cache, result, "wheels/almamesh-0.1.0-py3-none-any.whl") == b"WHEEL-BYTES"
    )
    meta = json.loads(read_synced_file(cache, result, "almamesh_meta.json"))
    assert "de421.bsp" in meta["constructs"]
    assert "wheels/almamesh-0.1.0-py3-none-any.whl" in meta["constructs"]


def test_publish_bundle_fails_closed_on_wrong_trust_root(tmp_path) -> None:
    private_key, _ = generate_keypair()
    _, wrong_public_key = generate_keypair()
    publish_bundle(tmp_path / "origin", Ed25519Signer(private_key), version="1.0.0")
    with pytest.raises(SignatureError):
        sync_constructs(str(tmp_path / "origin"), tmp_path / "cache", _verifier(wrong_public_key))


# --- key management -------------------------------------------------------


def test_generate_keypair_files_writes_loadable_raw_keys(tmp_path) -> None:
    private_path, public_path = tmp_path / "private.key", tmp_path / "public.key"
    generate_keypair_files(private_path, public_path)

    assert private_path.read_bytes() and public_path.read_bytes()
    # raw 32-byte ed25519, not PEM
    assert len(public_path.read_bytes()) == 32

    # the written keys actually sign + verify a round trip (fail-closed otherwise)
    signer = Ed25519Signer.from_private_bytes(private_path.read_bytes())
    verifier = Ed25519Verifier.from_public_bytes(public_path.read_bytes())
    verifier.verify(b"payload", signer.sign(b"payload"))  # raises on mismatch


def test_generate_keypair_files_writes_owner_only_private_key(tmp_path) -> None:
    private_path = tmp_path / "private.key"
    generate_keypair_files(private_path, tmp_path / "public.key")
    assert stat.S_IMODE(private_path.stat().st_mode) == 0o600


def test_generate_keypair_files_refuses_silent_overwrite(tmp_path) -> None:
    private_path, public_path = tmp_path / "private.key", tmp_path / "public.key"
    generate_keypair_files(private_path, public_path)
    original = private_path.read_bytes()
    with pytest.raises(FileExistsError):
        generate_keypair_files(private_path, public_path)
    assert private_path.read_bytes() == original  # untouched


# --- staging trust boundary ----------------------------------------------


def test_publish_bundle_rejects_staging_collision_with_engine_construct(tmp_path) -> None:
    private_key, _ = generate_keypair()
    staging = tmp_path / "staging"
    staging.mkdir()
    (staging / "lahiri_ayanamsa.txt").write_bytes(b"forged-table")  # would shadow the signed one
    with pytest.raises(ValueError, match="collide"):
        publish_bundle(
            tmp_path / "origin", Ed25519Signer(private_key), version="1.0.0", staging_dir=staging
        )


def test_publish_bundle_rejects_reserved_meta_name_in_staging(tmp_path) -> None:
    private_key, _ = generate_keypair()
    staging = tmp_path / "staging"
    staging.mkdir()
    (staging / "almamesh_meta.json").write_bytes(b"{}")
    with pytest.raises(ValueError, match="reserved"):
        publish_bundle(
            tmp_path / "origin", Ed25519Signer(private_key), version="1.0.0", staging_dir=staging
        )


def test_publish_bundle_rejects_symlink_in_staging(tmp_path) -> None:
    private_key, _ = generate_keypair()
    secret = tmp_path / "secret.txt"
    secret.write_bytes(b"out-of-tree-secret")
    staging = tmp_path / "staging"
    staging.mkdir()
    os.symlink(secret, staging / "leak.bsp")  # symlink escaping the staging tree
    with pytest.raises(ValueError, match="symlink"):
        publish_bundle(
            tmp_path / "origin", Ed25519Signer(private_key), version="1.0.0", staging_dir=staging
        )
