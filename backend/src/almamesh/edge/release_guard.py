"""Fail-closed release preflight for the signed production bundle pointer."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from urllib.parse import urlencode, urlsplit, urlunsplit
from urllib.request import Request, urlopen

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from edgeproc.bundles.manifest import VersionPointer, pointer_signing_bytes
from edgeproc.bundles.signing import Ed25519Verifier, SignatureError

_BUNDLE_ID = "almamesh-constructs"
_CHANNEL = "stable"
_TIMEOUT_SECONDS = 30


class ReleaseGuardError(ValueError):
    """A release pointer failed authenticity, identity, or freshness checks."""


def _require_identity(pointer: VersionPointer) -> int:
    if pointer.bundle_id != _BUNDLE_ID or pointer.channel != _CHANNEL:
        raise ReleaseGuardError("pointer is not the stable AlmaMesh bundle")
    if pointer.sequence is None:
        raise ReleaseGuardError("pointer has no monotonic release sequence")
    return pointer.sequence


def verify_pointer(pointer: VersionPointer, public_key: Ed25519PublicKey) -> VersionPointer:
    """Verify a pointer's signature and production identity before comparing it."""
    try:
        Ed25519Verifier(public_key).verify(pointer_signing_bytes(pointer), pointer.signature)
    except SignatureError as exc:
        raise ReleaseGuardError("pointer signature verification failed") from exc
    _require_identity(pointer)
    return pointer


def compare_release_sequences(candidate: VersionPointer, live: VersionPointer) -> None:
    """Reject rollback and equal-sequence equivocation; allow a true retry."""
    candidate_sequence = _require_identity(candidate)
    live_sequence = _require_identity(live)
    if candidate_sequence < live_sequence:
        raise ReleaseGuardError("candidate sequence is lower than live")
    if candidate_sequence == live_sequence and candidate != live:
        raise ReleaseGuardError("candidate sequence matches a different pointer")


def _read_pointer(path: Path) -> VersionPointer:
    return VersionPointer.model_validate_json(path.read_bytes())


def _live_url(url: str) -> str:
    parsed = urlsplit(url)
    if parsed.scheme != "https":
        raise ReleaseGuardError("live preflight requires HTTPS transport")
    query = urlencode({"release_guard": "1"})
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, query, parsed.fragment))


def _fetch_pointer(url: str) -> VersionPointer:
    request = Request(_live_url(url), headers={"Cache-Control": "no-cache"})
    with urlopen(request, timeout=_TIMEOUT_SECONDS) as response:
        return VersionPointer.model_validate_json(response.read())


def run(candidate_path: Path, public_key_path: Path, live_url: str | None) -> None:
    """Validate the candidate and optionally compare it with the durable live pointer."""
    candidate = _read_pointer(candidate_path)
    public_key = Ed25519PublicKey.from_public_bytes(public_key_path.read_bytes())
    verify_pointer(candidate, public_key)
    if live_url is None:
        return
    live = _fetch_pointer(live_url)
    verify_pointer(live, public_key)
    compare_release_sequences(candidate, live)


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--candidate", type=Path, required=True)
    parser.add_argument("--public-key", type=Path, required=True)
    parser.add_argument("--live-url")
    return parser


def main() -> int:
    args = _parser().parse_args()
    try:
        run(args.candidate, args.public_key, args.live_url)
    except (OSError, ReleaseGuardError, ValueError, json.JSONDecodeError) as exc:
        raise SystemExit(f"release preflight failed: {exc}") from exc
    sys.stdout.write("release preflight passed\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
