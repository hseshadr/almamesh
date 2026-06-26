"""Local-first edge-proc integration for AlmaMesh.

Wraps the deterministic chart core as an edge-proc Runtime and provides the
signed content-addressed delivery of its constructs (ephemeris + ayanamsa).
Compute stays on the device; the edge is delivery-only.
"""

from __future__ import annotations

from edgeproc import EdgeProc, RuntimeRegistry

from almamesh.edge.chart_runtime import ChartRuntime


def build_chart_engine() -> EdgeProc:
    """An EdgeProc facade with the deterministic chart runtime registered."""
    registry = RuntimeRegistry()
    registry.register(ChartRuntime())
    return EdgeProc(registry=registry)


__all__ = ["ChartRuntime", "build_chart_engine"]
