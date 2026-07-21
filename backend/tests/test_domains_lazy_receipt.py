"""Regression: importing the domains SYNTHESIS engine must not drag in ``avow``.

WHY this exists: the in-browser Pyodide predictive engine imports ``almamesh.domains``
to compute the Life Atlas, but it never signs a strength receipt. An eager re-export
of the receipt helpers used to force ``import avow`` -> ``pynacl`` at module load,
which broke the offline in-browser predictive path (a WASM crypto dylib in the hot
path). The re-export is now lazy (PEP 562); the signing helpers stay reachable on
first access for the backend/CLI signers.
"""

from __future__ import annotations

import subprocess
import sys

_AVOW_FREE_IMPORT = (
    "import sys\n"
    "import almamesh.domains\n"
    "from almamesh.domains import compute_life_domains\n"
    "assert callable(compute_life_domains)\n"
    "leaked = {m for m in ('avow', 'nacl') if m in sys.modules}\n"
    "assert not leaked, f'predictive import leaked {leaked}'\n"
)


def test_importing_domains_does_not_import_avow() -> None:
    """A fresh interpreter can import the synthesis engine without avow/pynacl."""
    result = subprocess.run(
        [sys.executable, "-c", _AVOW_FREE_IMPORT],
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr


def test_signing_helpers_still_resolve_lazily() -> None:
    """The receipt helpers remain importable from the package (lazy re-export)."""
    from almamesh.domains import (
        DomainStrengthSubject,
        sign_domain_strength,
        verify_domain_strength,
    )

    assert callable(sign_domain_strength)
    assert callable(verify_domain_strength)
    assert DomainStrengthSubject.__name__ == "DomainStrengthSubject"


def test_unknown_attribute_still_raises() -> None:
    """``__getattr__`` only intercepts the receipt exports, nothing else."""
    import almamesh.domains as domains

    try:
        domains.does_not_exist  # noqa: B018 - intentional attribute probe
    except AttributeError:
        return
    raise AssertionError("expected AttributeError for an unknown attribute")
