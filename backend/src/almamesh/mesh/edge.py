"""The mesh edge — the full relation bundle between two READ-ONLY charts.

Composes Ashtakoota (roles explicit), the mutual Mangal-dosha screen, both
overlay directions, dasha synchrony over an explicit window, and each chart's
relation significators into one frozen :class:`MeshEdgeContext`. Neither
input chart is recomputed or mutated anywhere in this pipeline.
"""

from __future__ import annotations

from datetime import datetime

from almamesh.mesh.ashtakoota import compute_ashtakoota
from almamesh.mesh.mangal import compute_dosha_match
from almamesh.mesh.overlay import compute_overlay_pair
from almamesh.mesh.significators import compute_relation_reading
from almamesh.mesh.synchrony import compute_dasha_synchrony
from almamesh.schemas.astrology import SiderealContext
from almamesh.schemas.mesh import MatchRole, MeshEdgeContext, Relationship


def _melapaka_order(
    a: SiderealContext, b: SiderealContext, role_a: MatchRole, role_b: MatchRole
) -> tuple[SiderealContext, SiderealContext]:
    """(bride, groom) per the EXPLICIT caller-passed roles — never guessed."""
    if role_a is role_b:
        raise ValueError("role_a and role_b must differ (one bride, one groom)")
    return (a, b) if role_a is MatchRole.BRIDE else (b, a)


def compute_mesh_edge(
    a: SiderealContext,
    b: SiderealContext,
    *,
    relationship: Relationship,
    role_a: MatchRole,
    role_b: MatchRole,
    window_start: datetime,
    window_end: datetime,
) -> MeshEdgeContext:
    """The full relation context between charts ``a`` and ``b`` (read-only)."""
    bride, groom = _melapaka_order(a, b, role_a, role_b)
    return MeshEdgeContext(
        relationship=relationship,
        role_a=role_a,
        role_b=role_b,
        ashtakoota=compute_ashtakoota(bride=bride, groom=groom),
        mangal_match=compute_dosha_match(a, b),
        overlay=compute_overlay_pair(a, b),
        synchrony=compute_dasha_synchrony(a, b, start=window_start, end=window_end),
        significators_a=compute_relation_reading(a, relationship),
        significators_b=compute_relation_reading(b, relationship),
    )
