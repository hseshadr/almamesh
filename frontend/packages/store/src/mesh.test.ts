/**
 * useMeshStore — relational mesh edges between the anchor and a member.
 *
 * The runtime is mocked (an object with `computeMeshEdge`); the raw edge it
 * returns is CUT FROM THE REAL backend mesh golden (the exact worker shape).
 * The store must read both profiles' birth data from the chart library, drive
 * status loading -> ready per pair key, adapt through the pure `toMeshEdgeCtx`
 * adapter, be IDEMPOTENT per request, and invalidate when either profile's
 * birth data changes (the same derive-identity-from-inputs convention charts
 * use today).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MeshEdgeContext, MeshEdgeInput } from "@almamesh/browser/types";

import meshGolden from "../../../../backend/tests/fixtures/mesh_golden_de421.json";
import { useChartLibraryStore, type StoredChart } from "./chartLibrary";
import { pairKeyOf, useMeshStore, type MeshEdgeWindow } from "./mesh";
import type { Profile } from "./profiles";

// --- fixture: the real golden spouse edge (Delhi anchor x Mumbai member) ---

const SPOUSE_KEY = "1990-01-15T12:00:00+00:00|1985-07-23T04:30:00+00:00|spouse";
const RAW_EDGE = (meshGolden as Record<string, MeshEdgeContext>)[SPOUSE_KEY];

const ANCHOR: Profile = {
  id: "p-anchor",
  name: "Asha",
  createdAt: "2026-01-01T00:00:00Z",
  avatarTint: "#C9A24B",
  relationship: "self",
};

const MEMBER: Profile = {
  id: "p-member",
  name: "Dev",
  createdAt: "2026-01-02T00:00:00Z",
  avatarTint: "#3A4FB0",
  relationship: "spouse",
  relatedTo: "p-anchor",
};

// The golden pair's births: Delhi (anchor) and Mumbai (member).
const ANCHOR_BIRTH = { iso: "1990-01-15T12:00:00+00:00", lat: 28.6139, lon: 77.209 };
const MEMBER_BIRTH = { iso: "1985-07-23T04:30:00+00:00", lat: 19.076, lon: 72.8777 };

// The golden pins: dasha reference + synchrony window.
const WINDOW: MeshEdgeWindow = {
  start: "2025-01-01T00:00:00+00:00",
  end: "2027-01-01T00:00:00+00:00",
  referenceInstant: "2025-01-01T00:00:00+00:00",
};

const EXPECTED_INPUT: MeshEdgeInput = {
  a: { datetimeUtc: ANCHOR_BIRTH.iso, latitude: ANCHOR_BIRTH.lat, longitude: ANCHOR_BIRTH.lon },
  b: { datetimeUtc: MEMBER_BIRTH.iso, latitude: MEMBER_BIRTH.lat, longitude: MEMBER_BIRTH.lon },
  relationship: "spouse",
  roleA: "bride",
  roleB: "groom",
  windowStart: WINDOW.start,
  windowEnd: WINDOW.end,
  referenceInstant: WINDOW.referenceInstant,
};

function storedChart(
  chartId: string,
  profileId: string,
  birth: { iso: string; lat: number; lon: number },
): StoredChart {
  return {
    chart_id: chartId,
    person_name: "fixture",
    is_primary: true,
    profile_id: profileId,
    birth_data: {
      birth_datetime_utc: birth.iso,
      birth_datetime_local: birth.iso,
      birth_location_details: {
        city: "fixture-city",
        latitude: birth.lat,
        longitude: birth.lon,
        timezone: "UTC",
      },
    },
    astronomical_calculations: {} as StoredChart["astronomical_calculations"],
  };
}

function seedCharts(): void {
  useChartLibraryStore.getState().saveChart(storedChart("c-anchor", ANCHOR.id, ANCHOR_BIRTH));
  useChartLibraryStore.getState().saveChart(storedChart("c-member", MEMBER.id, MEMBER_BIRTH));
}

const makeRuntime = (impl?: () => Promise<MeshEdgeContext>) => ({
  computeMeshEdge: vi.fn(impl ?? (() => Promise.resolve(RAW_EDGE))),
});

const PAIR = pairKeyOf(ANCHOR.id, MEMBER.id);

describe("useMeshStore.ensureMeshEdge", () => {
  beforeEach(() => {
    useMeshStore.getState().reset();
    useChartLibraryStore.setState({ charts: {} });
  });

  it("starts with no edges", () => {
    expect(useMeshStore.getState().edges).toEqual({});
  });

  it("reads both profiles' birth data from the chart library and computes anchor=a/bride, member=b/groom", async () => {
    seedCharts();
    const runtime = makeRuntime();

    await useMeshStore.getState().ensureMeshEdge(runtime, ANCHOR, MEMBER, WINDOW);

    expect(runtime.computeMeshEdge).toHaveBeenCalledExactlyOnceWith(EXPECTED_INPUT);
    const entry = useMeshStore.getState().edges[PAIR];
    expect(entry?.status).toBe("ready");
    expect(entry?.error).toBeUndefined();
    // Adapted (UI-shaped) edge: engine Title-Case signs become lowercase.
    expect(entry?.edge?.relationship).toBe("spouse");
    expect(entry?.edge?.ashtakoota.total).toBe(21.5);
    expect(entry?.edge?.ashtakoota.bride_moon.sign).toBe(
      RAW_EDGE.ashtakoota.bride_moon.sign.toLowerCase(),
    );
    expect(entry?.edge?.integrity_note).toBe(RAW_EDGE.integrity_note);
  });

  it("is idempotent: a repeat call for the same pair + births + window is a no-op", async () => {
    seedCharts();
    const runtime = makeRuntime();

    await useMeshStore.getState().ensureMeshEdge(runtime, ANCHOR, MEMBER, WINDOW);
    await useMeshStore.getState().ensureMeshEdge(runtime, ANCHOR, MEMBER, WINDOW);

    expect(runtime.computeMeshEdge).toHaveBeenCalledTimes(1);
  });

  it("recomputes when a profile's birth data changes (chart-style identity invalidation)", async () => {
    seedCharts();
    const runtime = makeRuntime();
    await useMeshStore.getState().ensureMeshEdge(runtime, ANCHOR, MEMBER, WINDOW);

    // The member's birth is corrected -> regeneration saves a NEW primary chart.
    const corrected = { iso: "1985-07-23T05:00:00+00:00", lat: 19.076, lon: 72.8777 };
    useChartLibraryStore.getState().saveChart(storedChart("c-member-2", MEMBER.id, corrected));
    await useMeshStore.getState().ensureMeshEdge(runtime, ANCHOR, MEMBER, WINDOW);

    expect(runtime.computeMeshEdge).toHaveBeenCalledTimes(2);
    expect(runtime.computeMeshEdge).toHaveBeenLastCalledWith({
      ...EXPECTED_INPUT,
      b: { datetimeUtc: corrected.iso, latitude: corrected.lat, longitude: corrected.lon },
    });
  });

  it("recomputes for a different window or reference instant (explicit, never cached across pins)", async () => {
    seedCharts();
    const runtime = makeRuntime();
    await useMeshStore.getState().ensureMeshEdge(runtime, ANCHOR, MEMBER, WINDOW);

    await useMeshStore
      .getState()
      .ensureMeshEdge(runtime, ANCHOR, MEMBER, { ...WINDOW, end: "2028-01-01T00:00:00+00:00" });

    expect(runtime.computeMeshEdge).toHaveBeenCalledTimes(2);
  });

  it("honors explicit role overrides (anchor=groom implies member=bride)", async () => {
    seedCharts();
    const runtime = makeRuntime();

    await useMeshStore
      .getState()
      .ensureMeshEdge(runtime, ANCHOR, MEMBER, { ...WINDOW, anchorRole: "groom" });

    expect(runtime.computeMeshEdge).toHaveBeenCalledExactlyOnceWith({
      ...EXPECTED_INPUT,
      roleA: "groom",
      roleB: "bride",
    });
  });

  it("errors without calling the engine when the member has no relationship", async () => {
    seedCharts();
    const runtime = makeRuntime();
    const stranger: Profile = { ...MEMBER, relationship: undefined };

    await useMeshStore.getState().ensureMeshEdge(runtime, ANCHOR, stranger, WINDOW);

    expect(runtime.computeMeshEdge).not.toHaveBeenCalled();
    const entry = useMeshStore.getState().edges[pairKeyOf(ANCHOR.id, stranger.id)];
    expect(entry?.status).toBe("error");
    expect(entry?.error).toContain("relationship");
  });

  it("errors without calling the engine when the anchor is not marked self", async () => {
    seedCharts();
    const runtime = makeRuntime();
    const notAnchor: Profile = { ...ANCHOR, relationship: undefined };

    await useMeshStore.getState().ensureMeshEdge(runtime, notAnchor, MEMBER, WINDOW);

    expect(runtime.computeMeshEdge).not.toHaveBeenCalled();
    expect(useMeshStore.getState().edges[PAIR]?.status).toBe("error");
  });

  it("errors (named profile) when a profile has no stored chart with birth data", async () => {
    useChartLibraryStore.getState().saveChart(storedChart("c-anchor", ANCHOR.id, ANCHOR_BIRTH));
    const runtime = makeRuntime();

    await useMeshStore.getState().ensureMeshEdge(runtime, ANCHOR, MEMBER, WINDOW);

    expect(runtime.computeMeshEdge).not.toHaveBeenCalled();
    const entry = useMeshStore.getState().edges[PAIR];
    expect(entry?.status).toBe("error");
    expect(entry?.error).toContain("Dev");
  });

  it("stores the engine failure as a retryable error state", async () => {
    seedCharts();
    const failing = makeRuntime(() =>
      Promise.reject(new Error("role_a and role_b must differ (one bride, one groom)")),
    );

    await useMeshStore.getState().ensureMeshEdge(failing, ANCHOR, MEMBER, WINDOW);
    expect(useMeshStore.getState().edges[PAIR]?.status).toBe("error");
    expect(useMeshStore.getState().edges[PAIR]?.error).toContain("role_a and role_b");

    const ok = makeRuntime();
    await useMeshStore.getState().ensureMeshEdge(ok, ANCHOR, MEMBER, WINDOW);
    expect(ok.computeMeshEdge).toHaveBeenCalledTimes(1);
    expect(useMeshStore.getState().edges[PAIR]?.status).toBe("ready");
  });

  it("ignores a stale in-flight result after the request was superseded", async () => {
    seedCharts();
    let resolveFirst: ((edge: MeshEdgeContext) => void) | undefined;
    const first = new Promise<MeshEdgeContext>((resolve) => {
      resolveFirst = resolve;
    });
    const runtime = {
      computeMeshEdge: vi
        .fn<(input: MeshEdgeInput) => Promise<MeshEdgeContext>>()
        .mockReturnValueOnce(first)
        .mockResolvedValue(RAW_EDGE),
    };

    const stale = useMeshStore.getState().ensureMeshEdge(runtime, ANCHOR, MEMBER, WINDOW);
    const fresh = useMeshStore
      .getState()
      .ensureMeshEdge(runtime, ANCHOR, MEMBER, { ...WINDOW, end: "2028-01-01T00:00:00+00:00" });
    await fresh;
    // The superseded promise resolving late must NOT clobber the fresh edge.
    resolveFirst?.({ ...RAW_EDGE, relationship: "friend" });
    await stale;

    const entry = useMeshStore.getState().edges[PAIR];
    expect(entry?.status).toBe("ready");
    expect(entry?.edge?.relationship).toBe("spouse");
  });

  it("keys edges per pair so several members coexist", async () => {
    seedCharts();
    const sibling: Profile = {
      id: "p-sibling",
      name: "Mira",
      createdAt: "2026-01-03T00:00:00Z",
      avatarTint: "#C84A3A",
      relationship: "sibling",
      relatedTo: ANCHOR.id,
    };
    useChartLibraryStore.getState().saveChart(storedChart("c-sibling", sibling.id, MEMBER_BIRTH));
    const runtime = makeRuntime();

    await useMeshStore.getState().ensureMeshEdge(runtime, ANCHOR, MEMBER, WINDOW);
    await useMeshStore.getState().ensureMeshEdge(runtime, ANCHOR, sibling, WINDOW);

    expect(Object.keys(useMeshStore.getState().edges).sort()).toEqual(
      [PAIR, pairKeyOf(ANCHOR.id, sibling.id)].sort(),
    );
  });

  it("invalidateEdgesFor drops every edge touching the profile (either side)", async () => {
    seedCharts();
    const runtime = makeRuntime();
    await useMeshStore.getState().ensureMeshEdge(runtime, ANCHOR, MEMBER, WINDOW);

    useMeshStore.getState().invalidateEdgesFor(MEMBER.id);

    expect(useMeshStore.getState().edges[PAIR]).toBeUndefined();
  });

  it("reset clears all edges", async () => {
    seedCharts();
    await useMeshStore.getState().ensureMeshEdge(makeRuntime(), ANCHOR, MEMBER, WINDOW);

    useMeshStore.getState().reset();

    expect(useMeshStore.getState().edges).toEqual({});
  });
});
