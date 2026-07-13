"""Import-boundary smoke tests."""

from __future__ import annotations

import importlib
import inspect
import subprocess
import sys

_COLD_IMPORT_PROBE = """
import importlib
import sys
assert "almamesh.calculations" not in sys.modules
module = importlib.import_module("almamesh.calculations")
print("OK" if callable(module.calculate_sidereal_context) else "NOT_CALLABLE")
"""


def _run_cold_import() -> subprocess.CompletedProcess[str]:
    """Import calculations in a fresh interpreter and capture the result."""
    return subprocess.run(
        [sys.executable, "-c", _COLD_IMPORT_PROBE],
        capture_output=True,
        text=True,
        check=False,
    )


def test_should_import_calculations_in_cold_subprocess() -> None:
    # Given / When
    result = _run_cold_import()

    # Then
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "OK"


def test_should_import_calculations_without_suppressed_late_imports() -> None:
    # Given / When
    module = importlib.import_module("almamesh.calculations")

    # Then
    assert callable(module.calculate_sidereal_context)
    assert "# noqa: E402" not in inspect.getsource(module)
