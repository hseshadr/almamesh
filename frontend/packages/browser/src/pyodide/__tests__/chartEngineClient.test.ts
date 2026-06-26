import { beforeEach, describe, expect, it } from "vitest";

import { ChartEngineClient } from "../chartEngineClient";
import type { SiderealChart } from "../chart";
import type { MeshEdgeContext } from "../mesh";
import type { PredictiveContexts } from "../predictive";
import type {
  BootConfig,
  BirthInput,
  ChartWorkerRequest,
  ChartWorkerResponse,
  MeshEdgeInput,
  PredictiveInput,
  WorkerLike,
} from "../protocol";

const BIRTH: BirthInput = {
  datetimeUtc: "1990-01-15T12:00:00+00:00",
  latitude: 28.6139,
  longitude: 77.209,
  referenceDate: "2020-06-01T00:00:00+00:00",
};

const BOOT_CONFIG: BootConfig = {
  pyodideIndexUrl: "https://example.test/pyodide/",
  wheels: [{ filename: "almamesh-0.1.0-py3-none-any.whl", bytes: new Uint8Array([1, 2, 3]) }],
  skyfieldData: [{ filename: "de421.bsp", bytes: new Uint8Array([4, 5, 6]) }],
};

const STUB_CHART = { ayanamsa_value: 23.7 } as unknown as SiderealChart;

const PREDICTIVE_INPUT: PredictiveInput = {
  datetimeUtc: "1990-01-15T12:00:00+00:00",
  latitude: 28.6139,
  longitude: 77.209,
  referenceInstant: "2026-06-09T12:00:00+00:00",
};

const STUB_PREDICTIVE = {
  transit_context: { instant: "2026-06-09T12:00:00+00:00" },
} as unknown as PredictiveContexts;

const MESH_INPUT: MeshEdgeInput = {
  a: { datetimeUtc: "1990-01-15T12:00:00+00:00", latitude: 28.6139, longitude: 77.209 },
  b: { datetimeUtc: "1985-07-23T04:30:00+00:00", latitude: 19.076, longitude: 72.8777 },
  relationship: "spouse",
  roleA: "bride",
  roleB: "groom",
  windowStart: "2025-01-01T00:00:00+00:00",
  windowEnd: "2027-01-01T00:00:00+00:00",
  referenceInstant: "2025-01-01T00:00:00+00:00",
};

const STUB_MESH_EDGE = {
  relationship: "spouse",
  role_a: "bride",
  role_b: "groom",
} as unknown as MeshEdgeContext;

/**
 * A scripted worker double: each posted request is answered by `reply`, async,
 * so the client's id-correlation and promise plumbing are exercised for real.
 */
class FakeChartWorker implements WorkerLike {
  public readonly posted: ChartWorkerRequest[] = [];
  public terminated = false;
  #listener: ((event: MessageEvent<ChartWorkerResponse>) => void) | undefined;

  public constructor(
    private readonly reply: (req: ChartWorkerRequest) => ChartWorkerResponse | null,
  ) {}

  public postMessage(message: ChartWorkerRequest): void {
    this.posted.push(message);
    const response = this.reply(message);
    if (response !== null) {
      queueMicrotask(() => {
        this.#listener?.(new MessageEvent("message", { data: response }));
      });
    }
  }

  public addEventListener(
    _type: "message",
    listener: (event: MessageEvent<ChartWorkerResponse>) => void,
  ): void {
    this.#listener = listener;
  }

  public terminate(): void {
    this.terminated = true;
  }
}

describe("ChartEngineClient", () => {
  let worker: FakeChartWorker;

  const withReply = (reply: (req: ChartWorkerRequest) => ChartWorkerResponse | null) => {
    worker = new FakeChartWorker(reply);
    return new ChartEngineClient(worker);
  };

  beforeEach(() => {
    worker = new FakeChartWorker(() => null);
  });

  it("boots by forwarding the config and resolving on a boot-ok reply", async () => {
    const client = withReply((req) => ({ ok: true, kind: "boot", id: req.id }));

    await client.boot(BOOT_CONFIG);

    expect(worker.posted[0]).toMatchObject({ kind: "boot", config: BOOT_CONFIG });
  });

  it("generates a chart, returning the worker's chart payload", async () => {
    const client = withReply((req) => ({
      ok: true,
      kind: "generateChart",
      id: req.id,
      chart: STUB_CHART,
    }));

    const chart = await client.generateChart(BIRTH);

    expect(chart).toBe(STUB_CHART);
    expect(worker.posted[0]).toMatchObject({ kind: "generateChart", birth: BIRTH });
  });

  it("computes the lazy predictive payload, forwarding the explicit reference instant", async () => {
    const client = withReply((req) => ({
      ok: true,
      kind: "computePredictive",
      id: req.id,
      predictive: STUB_PREDICTIVE,
    }));

    const predictive = await client.computePredictive(PREDICTIVE_INPUT);

    expect(predictive).toBe(STUB_PREDICTIVE);
    expect(worker.posted[0]).toMatchObject({
      kind: "computePredictive",
      input: PREDICTIVE_INPUT,
    });
  });

  it("rejects computePredictive with the worker's error message", async () => {
    const client = withReply((req) => ({ ok: false, id: req.id, error: "engine not booted" }));

    await expect(client.computePredictive(PREDICTIVE_INPUT)).rejects.toThrow("engine not booted");
  });

  it("computes the mesh edge, forwarding both births + relationship/roles + the explicit window", async () => {
    const client = withReply((req) => ({
      ok: true,
      kind: "computeMeshEdge",
      id: req.id,
      meshEdge: STUB_MESH_EDGE,
    }));

    const meshEdge = await client.computeMeshEdge(MESH_INPUT);

    expect(meshEdge).toBe(STUB_MESH_EDGE);
    expect(worker.posted[0]).toMatchObject({
      kind: "computeMeshEdge",
      input: MESH_INPUT,
    });
  });

  it("rejects computeMeshEdge with the worker's error message", async () => {
    const client = withReply((req) => ({
      ok: false,
      id: req.id,
      error: "role_a and role_b must differ (one bride, one groom)",
    }));

    await expect(client.computeMeshEdge(MESH_INPUT)).rejects.toThrow(
      "role_a and role_b must differ",
    );
  });

  it("rejects with the worker's error message", async () => {
    const client = withReply((req) => ({ ok: false, id: req.id, error: "ephemeris missing" }));

    await expect(client.generateChart(BIRTH)).rejects.toThrow("ephemeris missing");
  });

  it("correlates concurrent requests by id even when replies arrive out of order", async () => {
    const client = withReply((req) => {
      if (req.kind !== "generateChart") {
        return { ok: true, kind: "boot", id: req.id };
      }
      // Answer the second request first to prove correlation is by id, not order.
      const chart = { ayanamsa_value: req.id } as unknown as SiderealChart;
      return { ok: true, kind: "generateChart", id: req.id, chart };
    });

    const [first, second] = await Promise.all([
      client.generateChart(BIRTH),
      client.generateChart(BIRTH),
    ]);

    expect(first.ayanamsa_value).not.toBe(second.ayanamsa_value);
  });

  it("terminates the underlying worker", () => {
    const client = withReply(() => null);

    client.terminate();

    expect(worker.terminated).toBe(true);
  });
});
