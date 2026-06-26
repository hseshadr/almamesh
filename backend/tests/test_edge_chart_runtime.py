"""The deterministic chart core wrapped as an edge-proc Runtime.

ChartRuntime accepts a LOCAL_ONLY, DETERMINISTIC task carrying birth data and
returns the full sidereal chart — the calc core runs entirely on-device.
"""

from edgeproc import CapabilityVerdict, PrivacyMode, Task, TaskKind

from almamesh.edge import build_chart_engine
from almamesh.edge.chart_runtime import ChartRuntime

_BIRTH = {
    "datetime_utc": "1990-01-15T12:00:00+00:00",
    "latitude": 40.7128,
    "longitude": -74.0060,
}


def _chart_task(payload: dict | None = None) -> Task:
    return Task(
        kind=TaskKind.DETERMINISTIC,
        payload=payload if payload is not None else dict(_BIRTH),
        privacy_mode=PrivacyMode.LOCAL_ONLY,
    )


def test_accepts_local_deterministic() -> None:
    assert ChartRuntime().can_handle(_chart_task()) == CapabilityVerdict.ACCEPT


def test_rejects_non_local_privacy() -> None:
    task = Task(
        kind=TaskKind.DETERMINISTIC, payload=dict(_BIRTH), privacy_mode=PrivacyMode.CLOUD_PREMIUM
    )
    assert ChartRuntime().can_handle(task) == CapabilityVerdict.REJECT_CAPABILITY


def test_rejects_other_task_kind() -> None:
    task = Task(kind=TaskKind.GENERATE, payload=dict(_BIRTH), privacy_mode=PrivacyMode.LOCAL_ONLY)
    assert ChartRuntime().can_handle(task) == CapabilityVerdict.REJECT_KIND


async def test_execute_returns_full_chart() -> None:
    result = await ChartRuntime().execute(_chart_task())
    assert result.success
    chart = result.payload["chart"]
    assert chart["lagna"]["sign"]
    assert len(chart["planets"]) == 9


async def test_execute_is_byte_identical_for_same_input() -> None:
    runtime = ChartRuntime()
    first = await runtime.execute(_chart_task())
    second = await runtime.execute(_chart_task())
    assert first.payload == second.payload  # no RNG, no clock in the calc core


async def test_reference_date_in_payload_selects_current_maha() -> None:
    early = dict(_BIRTH, reference_date="1995-01-01T00:00:00+00:00")
    late = dict(_BIRTH, reference_date="2040-01-01T00:00:00+00:00")

    r_early = await ChartRuntime().execute(_chart_task(early))
    r_late = await ChartRuntime().execute(_chart_task(late))

    assert r_early.success and r_late.success
    lord_early = r_early.payload["chart"]["dashas"]["current_maha"]["lord"]
    lord_late = r_late.payload["chart"]["dashas"]["current_maha"]["lord"]
    assert lord_early != lord_late  # 45y apart -> different maha period


async def test_execute_fails_closed_on_bad_payload() -> None:
    result = await ChartRuntime().execute(_chart_task({"latitude": 40.0}))
    assert not result.success
    assert result.error  # never raises; failure is encoded in the envelope


async def test_engine_routes_chart_task_end_to_end() -> None:
    result = await build_chart_engine().run(_chart_task())
    assert result.success
    assert result.runtime_used == "chart"
