"""Guard: NOTHING the Pyodide chart Worker imports may pull in ``avow``/``nacl``.

WHY this exists (the scar): the in-browser predictive path broke twice, the same
way, one module apart. First ``almamesh.domains`` eagerly re-exported the receipt
helpers, forcing ``import avow`` -> ``pynacl`` at module load. That was fixed and
pinned by ``test_domains_lazy_receipt``. Then ``almamesh.predictive`` — one level
UP, where nothing guarded it — reintroduced an identical module-level
``from avow import SignedReceipt``, and the app died at the first online Life
Atlas compute.

So the invariant is not "domains stays clean", it is:

    importing ANY module the chart Worker imports must not transitively import
    ``avow`` or ``nacl``.

Signing is a per-call concern. The Worker imports ``avow`` deliberately and
lazily inside ``_almamesh_device_signer()``; the engine modules themselves must
stay crypto-free so the natal boot never pays for the pynacl Ed25519 WASM dylib
and so a wheel can be imported on a runtime that has no crypto loaded at all.

The entry points are PARSED OUT OF ``chartWorker.ts`` rather than hardcoded, so
adding a new Worker entry point automatically inherits the guard instead of
silently escaping it (which is exactly how ``predictive`` escaped).
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

import pytest

_CHART_WORKER = (
    Path(__file__).resolve().parents[2]
    / "frontend"
    / "packages"
    / "browser"
    / "src"
    / "pyodide"
    / "chartWorker.ts"
)

# `from almamesh.foo.bar import baz, qux` inside the PY_BOOTSTRAP template.
_IMPORT_RE = re.compile(r"^\s*from\s+(almamesh[\w.]*)\s+import\s+([\w,\s]+)$", re.MULTILINE)

_FORBIDDEN = ("avow", "nacl")


def _worker_entry_points() -> list[tuple[str, tuple[str, ...]]]:
    """Every ``from almamesh... import ...`` the Worker's Python glue performs."""
    source = _CHART_WORKER.read_text(encoding="utf-8")
    entries: dict[str, tuple[str, ...]] = {}
    for module, names in _IMPORT_RE.findall(source):
        symbols = tuple(name.strip() for name in names.split(",") if name.strip())
        entries[module] = tuple(sorted(set(entries.get(module, ()) + symbols)))
    return sorted(entries.items())


def _probe_source(module: str, symbols: tuple[str, ...]) -> str:
    """A fresh-interpreter script importing one Worker entry point, crypto-free."""
    return (
        "import sys\n"
        f"from {module} import {', '.join(symbols)}\n"
        f"leaked = {{m for m in {_FORBIDDEN!r} if m in sys.modules}}\n"
        f"assert not leaked, 'importing {module} leaked ' + repr(sorted(leaked))\n"
    )


def test_chart_worker_source_is_reachable() -> None:
    """The guard must never go vacuous by silently losing its source of truth."""
    assert _CHART_WORKER.is_file(), f"chartWorker.ts not found at {_CHART_WORKER}"


def test_worker_entry_points_are_discovered() -> None:
    """Non-vacuity: the parse must actually find the Worker's real entry points."""
    modules = {module for module, _ in _worker_entry_points()}
    assert "almamesh.calculations" in modules
    assert "almamesh.predictive" in modules
    assert "almamesh.mesh" in modules
    assert "almamesh.rectification" in modules


@pytest.mark.parametrize(("module", "symbols"), _worker_entry_points(), ids=lambda v: str(v))
def test_worker_entry_point_does_not_import_avow(module: str, symbols: tuple[str, ...]) -> None:
    """A fresh interpreter imports each Worker entry point without avow/pynacl."""
    result = subprocess.run(
        [sys.executable, "-c", _probe_source(module, symbols)],
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr


def test_signing_entry_point_still_works() -> None:
    """The seam is lazy, NOT dead: sealing still works when a caller opts in."""
    from almamesh.domains.strength_receipt import seal_domain_strengths

    assert callable(seal_domain_strengths)
