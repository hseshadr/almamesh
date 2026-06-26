"""Relational (mesh) engine — deterministic math BETWEEN two finished charts.

INTEGRITY FRAME: classical Vedic astrology computes RELATIONS between charts —
compatibility scores (Ashtakoota Guna Milan), overlays, timing interlocks and
corroborations. It never claims one chart changes another's computation. Every
function in this package takes already-computed natal contexts as READ-ONLY
inputs and emits a relation context; it never recomputes or mutates either
chart (see ``almamesh.schemas.mesh`` for the full frame and the typed models).
"""

from almamesh.mesh.ashtakoota import (
    compute_ashtakoota,
    compute_ashtakoota_from_moons,
    moon_summary,
)
from almamesh.mesh.edge import compute_mesh_edge
from almamesh.mesh.mangal import compute_dosha_match, compute_mangal_dosha
from almamesh.mesh.overlay import compute_overlay, compute_overlay_pair
from almamesh.mesh.significators import compute_relation_reading
from almamesh.mesh.synchrony import compute_dasha_synchrony

__all__ = [
    "compute_ashtakoota",
    "compute_ashtakoota_from_moons",
    "compute_dasha_synchrony",
    "compute_dosha_match",
    "compute_mangal_dosha",
    "compute_mesh_edge",
    "compute_overlay",
    "compute_overlay_pair",
    "compute_relation_reading",
    "moon_summary",
]
