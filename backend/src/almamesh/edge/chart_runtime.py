"""The deterministic chart core wrapped as an edge-proc Runtime.

A LOCAL_ONLY, DETERMINISTIC task carries birth data; ``execute`` runs the pure
``calculate_sidereal_context`` on-device and returns the full sidereal chart.
Per the Runtime contract, failures are encoded in the ResultEnvelope, never
raised — so the router always gets a clean verdict.
"""

from __future__ import annotations

import time
from collections.abc import Mapping
from datetime import datetime

from edgeproc import (
    CapabilityVerdict,
    PrivacyMode,
    Provenance,
    ResultEnvelope,
    Task,
    TaskKind,
)
from edgeproc.core.models import JsonValue

from almamesh.calculations import calculate_sidereal_context
from almamesh.mesh import compute_mesh_edge
from almamesh.predictive import compute_predictive_contexts
from almamesh.schemas.astrology import SiderealContext
from almamesh.schemas.mesh import MatchRole, Relationship

_RUNTIME_VERSION = "almamesh-chart/0.1.0"


def _compute_chart(payload: Mapping[str, object]) -> dict[str, JsonValue]:
    """Run the deterministic calc core over birth data from a task payload.

    An optional ``reference_date`` (ISO 8601) pins the "current" Vimshottari
    maha dasha; omit it to use the wall clock. Passing it makes the chart fully
    reproducible (required for byte-parity and content-addressed bundles).
    """
    dt = datetime.fromisoformat(str(payload["datetime_utc"]))
    latitude = float(payload["latitude"])  # type: ignore[arg-type]
    longitude = float(payload["longitude"])  # type: ignore[arg-type]
    raw_reference = payload.get("reference_date")
    reference_date = datetime.fromisoformat(str(raw_reference)) if raw_reference else None
    return calculate_sidereal_context(
        dt, latitude, longitude, reference_date=reference_date
    ).model_dump(mode="json")


def compute_predictive(payload: Mapping[str, object]) -> dict[str, JsonValue]:
    """The LAZY predictive payload (transits + vargas + strength + domains).

    Unlike the natal chart, ``reference_instant`` (ISO 8601) is REQUIRED — there
    is no silent wall-clock fallback. The caller pins the instant, which pins
    both the "current" dasha and the transit "now", so the payload is
    reproducible (and byte-parity-testable) by construction.
    """
    contexts = compute_predictive_contexts(
        datetime.fromisoformat(str(payload["datetime_utc"])),
        float(payload["latitude"]),  # type: ignore[arg-type]
        float(payload["longitude"]),  # type: ignore[arg-type]
        datetime.fromisoformat(str(payload["reference_instant"])),
    )
    return contexts.model_dump(mode="json")


def _birth_input(value: object) -> Mapping[str, object]:
    """Narrow a mesh birth input to a mapping — fail loud on anything else."""
    if not isinstance(value, Mapping):
        raise TypeError("birth input must be a mapping with datetime_utc/latitude/longitude")
    return value


def _natal_for_mesh(birth: Mapping[str, object], reference_instant: datetime) -> SiderealContext:
    """One read-only natal context for the mesh, with its dasha clock pinned."""
    return calculate_sidereal_context(
        datetime.fromisoformat(str(birth["datetime_utc"])),
        float(birth["latitude"]),  # type: ignore[arg-type]
        float(birth["longitude"]),  # type: ignore[arg-type]
        reference_date=reference_instant,
    )


def compute_mesh(payload: Mapping[str, object]) -> dict[str, JsonValue]:
    """The relational mesh edge between TWO bare birth inputs (``a`` and ``b``).

    Both natal contexts are recomputed on device from the birth inputs — no
    chart crosses the worker boundary. Like ``compute_predictive``, every
    instant is REQUIRED and explicit: ``reference_instant`` pins both charts'
    "current" dasha and ``window_start``/``window_end`` bound the dasha
    synchrony — never a silent wall clock, so the payload is reproducible
    (and byte-parity-testable) by construction.
    """
    reference_instant = datetime.fromisoformat(str(payload["reference_instant"]))
    edge = compute_mesh_edge(
        _natal_for_mesh(_birth_input(payload["a"]), reference_instant),
        _natal_for_mesh(_birth_input(payload["b"]), reference_instant),
        relationship=Relationship(str(payload["relationship"])),
        role_a=MatchRole(str(payload["role_a"])),
        role_b=MatchRole(str(payload["role_b"])),
        window_start=datetime.fromisoformat(str(payload["window_start"])),
        window_end=datetime.fromisoformat(str(payload["window_end"])),
    )
    return edge.model_dump(mode="json")


class ChartRuntime:
    """edge-proc Runtime for the deterministic Vedic chart computation."""

    name = "chart"

    def can_handle(self, task: Task) -> CapabilityVerdict:
        if task.privacy_mode != PrivacyMode.LOCAL_ONLY:
            return CapabilityVerdict.REJECT_CAPABILITY
        if task.kind == TaskKind.DETERMINISTIC:
            return CapabilityVerdict.ACCEPT
        return CapabilityVerdict.REJECT_KIND

    async def execute(self, task: Task) -> ResultEnvelope:
        start = time.perf_counter()
        try:
            chart = _compute_chart(task.payload)
        except (KeyError, TypeError, ValueError) as exc:
            return self._envelope(task, start, success=False, payload={}, error=str(exc))
        return self._envelope(task, start, success=True, payload={"chart": chart})

    def _envelope(
        self,
        task: Task,
        start: float,
        *,
        success: bool,
        payload: dict[str, JsonValue],
        error: str | None = None,
    ) -> ResultEnvelope:
        return ResultEnvelope(
            request_id=task.request_id,
            task_kind=task.kind,
            success=success,
            payload=payload,
            runtime_used=self.name,
            privacy_mode=task.privacy_mode,
            confidence=1.0 if success else 0.0,
            latency_ms=(time.perf_counter() - start) * 1000,
            provenance=Provenance(signature_status="unsigned", runtime_version=_RUNTIME_VERSION),
            error=error,
        )
