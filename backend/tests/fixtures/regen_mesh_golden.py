"""Regenerate tests/fixtures/mesh_golden_de421.json deterministically.

Run: ``uv run python -m tests.fixtures.regen_mesh_golden``. Recomputes the
pinned MeshEdgeContext for each generic pair and rewrites the golden. Birth
instants, places, roles, the natal ``reference_date`` and the synchrony window
are all fixed (they must match ``tests/test_mesh_golden.py``); the engine is
deterministic, so the output is reproducible. Regenerate only on an intentional
engine change.
"""

from __future__ import annotations

import json
from pathlib import Path

# Single source of truth: reuse the golden test's pins, pairs and pipeline.
from tests.test_mesh_golden import GOLDEN_PATH, _canonical_edges


def main() -> None:
    """Write the golden fixture for every pair."""
    golden = _canonical_edges()
    out = Path(GOLDEN_PATH)
    out.write_text(json.dumps(golden, indent=2, sort_keys=True) + "\n")
    print(f"wrote {len(golden)} pairs to {out} ({out.stat().st_size} bytes)")  # noqa: T201 - dev script


if __name__ == "__main__":
    main()
