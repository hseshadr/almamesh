"""Contract tests for the mesh-edge runtime entrypoint.

The mesh edge is computed ON DEVICE from the TWO bare birth inputs — the
entrypoint recomputes both natal contexts internally (fast, deterministic) so
no chart ever crosses the worker boundary. Like ``compute_predictive``, every
instant is EXPLICIT: ``reference_instant`` pins both charts' "current" dasha
and ``window_start``/``window_end`` bound the dasha synchrony — there is no
silent ``now()``, so the payload is reproducible (and byte-parity-testable)
by construction.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from almamesh.calculations import calculate_sidereal_context
from almamesh.edge.chart_runtime import compute_mesh
from almamesh.mesh import compute_mesh_edge
from almamesh.schemas.mesh import MatchRole, Relationship

# The Delhi + Mumbai golden-fixture births (generic parity births, never personal).
BIRTH_A = {"datetime_utc": "1990-01-15T12:00:00+00:00", "latitude": 28.6139, "longitude": 77.2090}
BIRTH_B = {"datetime_utc": "1985-07-23T04:30:00+00:00", "latitude": 19.0760, "longitude": 72.8777}
REFERENCE_INSTANT = datetime(2025, 1, 1, tzinfo=UTC)
WINDOW_START = datetime(2025, 1, 1, tzinfo=UTC)
WINDOW_END = datetime(2027, 1, 1, tzinfo=UTC)

PAYLOAD_KEYS = frozenset(
    {
        "relationship",
        "role_a",
        "role_b",
        "ashtakoota",
        "mangal_match",
        "overlay",
        "synchrony",
        "significators_a",
        "significators_b",
        "integrity_note",
    }
)


def _payload_input(**overrides: object) -> dict[str, object]:
    base: dict[str, object] = {
        "a": BIRTH_A,
        "b": BIRTH_B,
        "relationship": "spouse",
        "role_a": "bride",
        "role_b": "groom",
        "window_start": WINDOW_START.isoformat(),
        "window_end": WINDOW_END.isoformat(),
        "reference_instant": REFERENCE_INSTANT.isoformat(),
    }
    base.update(overrides)
    return base


@pytest.fixture(scope="module")
def payload() -> dict[str, object]:
    return compute_mesh(_payload_input())


def test_payload_matches_the_standalone_pipeline(payload: dict[str, object]) -> None:
    """The entrypoint is byte-equal to computing both charts + the edge directly."""
    chart_a = calculate_sidereal_context(
        datetime.fromisoformat(str(BIRTH_A["datetime_utc"])),
        float(BIRTH_A["latitude"]),  # type: ignore[arg-type]
        float(BIRTH_A["longitude"]),  # type: ignore[arg-type]
        reference_date=REFERENCE_INSTANT,
    )
    chart_b = calculate_sidereal_context(
        datetime.fromisoformat(str(BIRTH_B["datetime_utc"])),
        float(BIRTH_B["latitude"]),  # type: ignore[arg-type]
        float(BIRTH_B["longitude"]),  # type: ignore[arg-type]
        reference_date=REFERENCE_INSTANT,
    )
    edge = compute_mesh_edge(
        chart_a,
        chart_b,
        relationship=Relationship.SPOUSE,
        role_a=MatchRole.BRIDE,
        role_b=MatchRole.GROOM,
        window_start=WINDOW_START,
        window_end=WINDOW_END,
    )
    assert payload == edge.model_dump(mode="json")


def test_payload_is_the_bare_mesh_edge_dump(payload: dict[str, object]) -> None:
    """Top-level keys are exactly the MeshEdgeContext fields — no wrapper."""
    assert set(payload) == PAYLOAD_KEYS
    assert payload["relationship"] == "spouse"
    assert payload["role_a"] == "bride"
    assert payload["role_b"] == "groom"


def test_reference_instant_is_required_no_silent_now() -> None:
    """Omitting the reference instant must raise — the engine never reads the clock."""
    inputs = _payload_input()
    del inputs["reference_instant"]
    with pytest.raises(KeyError):
        compute_mesh(inputs)


@pytest.mark.parametrize("missing", ["window_start", "window_end"])
def test_synchrony_window_is_required(missing: str) -> None:
    inputs = _payload_input()
    del inputs[missing]
    with pytest.raises(KeyError):
        compute_mesh(inputs)


def test_equal_roles_are_rejected() -> None:
    """role_a == role_b must raise — the engine never guesses who is whom."""
    with pytest.raises(ValueError, match="role_a and role_b must differ"):
        compute_mesh(_payload_input(role_a="bride", role_b="bride"))


def test_unknown_relationship_is_rejected() -> None:
    with pytest.raises(ValueError):
        compute_mesh(_payload_input(relationship="nemesis"))


def test_birth_inputs_must_be_mappings() -> None:
    with pytest.raises(TypeError):
        compute_mesh(_payload_input(a="1990-01-15T12:00:00+00:00"))


def test_payload_is_deterministic(payload: dict[str, object]) -> None:
    assert compute_mesh(_payload_input()) == payload
