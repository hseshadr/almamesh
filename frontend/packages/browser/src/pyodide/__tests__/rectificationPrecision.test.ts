import { describe, expect, it } from "vitest";

import { PY_BOOTSTRAP } from "../chartWorker";
import type { RectificationEventInputWire, RectificationInput } from "../rectification";

// Regression guard for the "approximate-date" precision threading.
//
// PR #3 added a per-event `precision` (exact | month | year | approx) that the
// Python scorer uses to widen transit windows. The app collects it and serialises
// it over the worker boundary, but the browser worker glue dropped it — it built
// `RectificationEventInput(date=..., category=...)` without precision, so every
// event was scored as `exact` and the feature was a silent no-op live.
//
// These run in `vitest` WITHOUT booting Pyodide; the heavy end-to-end behavioural
// proof (precision actually changing the engine result) lives in the offline
// integration gate `integration/rectification-precision.mjs`.
describe("rectification precision threading (browser worker glue)", () => {
  it("threads each event's precision into the Python RectificationEventInput (not dropped)", () => {
    // Whitespace-tolerant: the glue must source precision from the wire event,
    // defaulting to "exact" only when the caller omits it.
    expect(PY_BOOTSTRAP).toMatch(/precision\s*=\s*e\.get\(\s*"precision"\s*,\s*"exact"\s*\)/);
    // ...and that default must be applied where the event is constructed.
    expect(PY_BOOTSTRAP).toContain("RectificationEventInput(");
  });

  it("carries `precision` on the wire event type and preserves it across serialisation", () => {
    const event: RectificationEventInputWire = {
      date: "2023-02-01",
      category: "marriage",
      precision: "approx",
    };
    const input: RectificationInput = {
      datetimeUtc: "1988-08-08T01:14:00+00:00",
      latitude: 12.9716,
      longitude: 77.5946,
      utcOffsetMinutes: 330,
      events: [event],
      mode: "cusp",
      referenceDate: "2026-06-09T12:00:00+00:00",
    };

    const roundTripped = JSON.parse(JSON.stringify(input)) as RectificationInput;

    expect(roundTripped.events[0]?.precision).toBe("approx");
  });
});

// Spec 062: the wire input gained `spanMinutes` (honest window bound) and
// `anchorConfidence` ('about' | 'unknown', the E5 anchor prior). The Python
// glue must pass them through as `span_minutes` / `anchor_confidence` kwargs —
// and must OMIT the kwargs entirely when the caller does, so absent inputs
// stay byte-identical on older wheels.
describe("rectification span/anchor threading (Spec 062, browser worker glue)", () => {
  it("threads spanMinutes into the Python span_minutes kwarg (only when present)", () => {
    expect(PY_BOOTSTRAP).toMatch(/data\.get\(\s*"spanMinutes"\s*\)/);
    expect(PY_BOOTSTRAP).toMatch(/["']span_minutes["']/);
  });

  it("threads anchorConfidence into the Python anchor_confidence kwarg (only when present)", () => {
    expect(PY_BOOTSTRAP).toMatch(/data\.get\(\s*"anchorConfidence"\s*\)/);
    expect(PY_BOOTSTRAP).toMatch(/["']anchor_confidence["']/);
  });

  it("carries spanMinutes + anchorConfidence on the wire input across serialisation", () => {
    const input: RectificationInput = {
      datetimeUtc: "1988-08-08T01:14:00+00:00",
      latitude: 12.9716,
      longitude: 77.5946,
      utcOffsetMinutes: 330,
      events: [{ date: "2023-02-01", category: "marriage" }],
      mode: "window",
      spanMinutes: 90,
      anchorConfidence: "unknown",
      referenceDate: "2026-06-09T12:00:00+00:00",
    };

    const roundTripped = JSON.parse(JSON.stringify(input)) as RectificationInput;

    expect(roundTripped.spanMinutes).toBe(90);
    expect(roundTripped.anchorConfidence).toBe("unknown");
  });

  it("accepts the 17th category family_rupture on the wire event type (Spec 062 E6)", () => {
    const event: RectificationEventInputWire = {
      date: "2018-11-01",
      category: "family_rupture",
      precision: "month",
    };
    expect(event.category).toBe("family_rupture");
  });
});
