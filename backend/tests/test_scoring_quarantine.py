"""Quarantine guard for ``almamesh.dasha.scoring`` (calc-integrity mandate).

``dasha/scoring.py`` carries hardcoded "guaranteed high probability" expert
rules. That is a heuristic prediction layer, NOT deterministic astronomy, so it
must never leak into the shipped chart pipeline (``calculate_sidereal_context``
and its edge-proc Runtime wrapper). The transit engine (``dasha/engine.py``)
legitimately imports it, so a blanket "no module may import scoring" ban would
be wrong; this guard is scoped to the *chart pipeline's import closure*.

The check runs in a FRESH interpreter (subprocess) so any module imported
earlier in the pytest session can't mask a real chart-pipeline import.
"""

from __future__ import annotations

import subprocess
import sys

# The probe re-uses THIS interpreter's sys.path so it can import almamesh no
# matter which Python (system vs venv) is running pytest, while staying a fresh
# process so an earlier in-session import can't mask a real leak.
_PROBE = """
import sys
sys.path[:] = {search_path!r}

# Import exactly the chart pipeline the browser/CLI ships.
import almamesh.calculations  # noqa: F401
import almamesh.edge.chart_runtime  # noqa: F401

print("LEAKED" if "almamesh.dasha.scoring" in sys.modules else "CLEAN")
"""


def _run_probe() -> str:
    """Import the chart pipeline in a fresh interpreter; report scoring leakage."""
    code = _PROBE.format(search_path=list(sys.path))
    result = subprocess.run(  # noqa: S603 - fixed args, no user input
        [sys.executable, "-c", code],
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, f"probe failed:\n{result.stderr}"
    return result.stdout.strip()


def test_chart_pipeline_does_not_import_scoring() -> None:
    """Importing the shipped chart pipeline must not pull in dasha.scoring."""
    # Given a fresh interpreter that imports only the chart-pipeline closure
    # When that closure is fully imported
    verdict = _run_probe()
    # Then the heuristic scoring module is NOT among the loaded modules
    assert verdict == "CLEAN", (
        "dasha.scoring (heuristic 'guaranteed high probability' rules) leaked "
        "into the deterministic chart pipeline — calc-integrity violation."
    )


def test_scoring_module_is_marked_dormant() -> None:
    """scoring.py self-documents as dormant / not-for-production."""
    # Given the scoring module source
    from almamesh.dasha import scoring

    doc = scoring.__doc__ or ""
    # Then its docstring flags it dormant and not part of the shipped chart
    assert "DORMANT" in doc
    assert "NOT FOR PRODUCTION" in doc
