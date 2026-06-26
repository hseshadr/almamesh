"""Golden parity + determinism regression for the relational mesh edge (DE421).

Mirrors test_chart_golden.py / test_domains_golden.py: MeshEdgeContext for
three GENERIC pairs (built from the canonical parity-fixture births) is pinned
byte-for-byte. Natal goldens are untouched — the mesh edge is a SEPARATE,
additive object computed FROM two read-only natal contexts. Floats are
canonicalized to 6 decimals so trivial last-bit noise never trips the guard.

Regenerate (only on an intentional engine change):
    uv run python -m tests.fixtures.regen_mesh_golden
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from functools import cache
from pathlib import Path

import pytest

from almamesh.calculations import calculate_sidereal_context
from almamesh.mesh import compute_mesh_edge
from almamesh.schemas.astrology import SiderealContext
from almamesh.schemas.mesh import MatchRole, MeshEdgeContext, Relationship

# Pinned instants: reproducible natal dashas + an explicit synchrony window.
FIXED_REFERENCE_DATE = datetime(2025, 1, 1, tzinfo=UTC)
WINDOW_START = datetime(2025, 1, 1, tzinfo=UTC)
WINDOW_END = datetime(2027, 1, 1, tzinfo=UTC)

# (iso birth, lat, lon) — generic parity-fixture births only, never personal.
DELHI = ("1990-01-15T12:00:00+00:00", 28.6139, 77.2090)
MUMBAI = ("1985-07-23T04:30:00+00:00", 19.0760, 72.8777)
NYC = ("2000-12-31T23:59:00+00:00", 40.7128, -74.0060)
LONDON = ("1972-03-10T08:15:00+00:00", 51.5074, -0.1278)
SYDNEY = ("2010-06-21T18:00:00+00:00", -33.8688, 151.2093)
TOKYO = ("2019-11-09T17:45:00+00:00", 35.6895, 139.6917)

Birth = tuple[str, float, float]
PAIRS: list[tuple[Birth, Birth, Relationship]] = [
    (DELHI, MUMBAI, Relationship.SPOUSE),
    (LONDON, NYC, Relationship.BUSINESS),
    (SYDNEY, TOKYO, Relationship.FRIEND),
]

GOLDEN_PATH = Path(__file__).parent / "fixtures" / "mesh_golden_de421.json"


def _canonicalize(value: object) -> object:
    """Recursively round floats to 6 decimals; preserve bool; sort dict keys."""
    if isinstance(value, bool):
        return value
    if isinstance(value, float):
        return round(value, 6)
    if isinstance(value, dict):
        return {k: _canonicalize(value[k]) for k in sorted(value)}
    if isinstance(value, list):
        return [_canonicalize(item) for item in value]
    return value


@cache
def _chart(iso: str, lat: float, lon: float) -> SiderealContext:
    return calculate_sidereal_context(
        datetime.fromisoformat(iso), lat, lon, reference_date=FIXED_REFERENCE_DATE
    )


def _edge(a: Birth, b: Birth, relationship: Relationship) -> MeshEdgeContext:
    """One pair's mesh edge: chart a is the bride role, chart b the groom."""
    return compute_mesh_edge(
        _chart(*a),
        _chart(*b),
        relationship=relationship,
        role_a=MatchRole.BRIDE,
        role_b=MatchRole.GROOM,
        window_start=WINDOW_START,
        window_end=WINDOW_END,
    )


def _key(a: Birth, b: Birth, relationship: Relationship) -> str:
    return f"{a[0]}|{b[0]}|{relationship.value}"


def _canonical_edges() -> dict[str, object]:
    return {
        _key(a, b, rel): _canonicalize(_edge(a, b, rel).model_dump(mode="json"))
        for a, b, rel in PAIRS
    }


def _load_golden() -> dict[str, object]:
    loaded = json.loads(GOLDEN_PATH.read_text())
    assert isinstance(loaded, dict)
    return loaded


def test_all_mesh_pairs_match_golden() -> None:
    """Every pair's canonicalized MeshEdgeContext equals the committed golden."""
    golden = _load_golden()
    for a, b, rel in PAIRS:
        assert _canonicalize(_edge(a, b, rel).model_dump(mode="json")) == golden[_key(a, b, rel)]


def test_golden_file_round_trips_byte_identically() -> None:
    """Recomputing and reserializing reproduces the committed file EXACTLY."""
    expected = json.dumps(_canonical_edges(), indent=2, sort_keys=True) + "\n"
    assert GOLDEN_PATH.read_text() == expected


def test_mesh_edge_reference_values_are_sane() -> None:
    """Human-sanity guard: hand-derived headline facts of the spouse pair."""
    edge = _edge(DELHI, MUMBAI, Relationship.SPOUSE)
    assert edge.ashtakoota.total == 21.5  # hand-derived in test_mesh_ashtakoota
    assert edge.mangal_match.b.has_dosha and not edge.mangal_match.a.has_dosha
    assert len(edge.synchrony.segments) == 4
    assert edge.significators_a.karaka_house == 7
    assert edge.integrity_note  # the read-only frame travels with the payload


def test_roles_must_differ() -> None:
    with pytest.raises(ValueError, match="role"):
        compute_mesh_edge(
            _chart(*DELHI),
            _chart(*MUMBAI),
            relationship=Relationship.SPOUSE,
            role_a=MatchRole.BRIDE,
            role_b=MatchRole.BRIDE,
            window_start=WINDOW_START,
            window_end=WINDOW_END,
        )
