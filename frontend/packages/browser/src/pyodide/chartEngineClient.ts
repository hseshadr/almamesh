// Main-thread client over the Pyodide chart Worker. The worker owns the heavy
// WASM Python runtime; the main thread only sends typed requests and awaits
// replies. One in-flight map keyed by request id correlates responses to
// promises (mirrors the edge-proc EngineClient).

import type { SiderealChart } from "./chart";
import type { MeshEdgeContext } from "./mesh";
import type { PredictiveContexts } from "./predictive";
import type {
  BirthInput,
  BootConfig,
  ChartWorkerRequest,
  ChartWorkerResponse,
  MeshEdgeInput,
  PredictiveInput,
  WorkerLike,
} from "./protocol";

interface Pending {
  readonly resolve: (response: ChartWorkerResponse) => void;
}

export class ChartEngineClient {
  readonly #worker: WorkerLike;
  readonly #pending = new Map<number, Pending>();
  #nextId = 0;

  public constructor(worker: WorkerLike) {
    this.#worker = worker;
    this.#worker.addEventListener("message", (event) => {
      this.#onMessage(event.data);
    });
  }

  /** Spawn the bundled Pyodide chart Worker (module worker). */
  public static spawn(): ChartEngineClient {
    const worker = new Worker(new URL("./chartWorker.ts", import.meta.url), {
      type: "module",
    });
    return new ChartEngineClient(worker);
  }

  /** Boot Pyodide and load the AlmaMesh engine + ephemeris from `config`. */
  public async boot(config: BootConfig): Promise<void> {
    const response = await this.#send({ kind: "boot", id: this.#allocId(), config });
    if (!response.ok) {
      throw new Error(response.error);
    }
  }

  /** Compute a sidereal chart on-device. Requires a prior successful `boot`. */
  public async generateChart(birth: BirthInput): Promise<SiderealChart> {
    const response = await this.#send({ kind: "generateChart", id: this.#allocId(), birth });
    if (response.ok && response.kind === "generateChart") {
      return response.chart;
    }
    throw new Error(response.ok ? "unexpected response kind" : response.error);
  }

  /**
   * Compute the LAZY predictive payload (transits + vargas + strength + life
   * domains) on-device at the EXPLICIT `input.referenceInstant`. Requires a
   * prior successful `boot`. Heavy: ~35s under Pyodide — call lazily, never on
   * the natal chart path.
   */
  public async computePredictive(input: PredictiveInput): Promise<PredictiveContexts> {
    const response = await this.#send({ kind: "computePredictive", id: this.#allocId(), input });
    if (response.ok && response.kind === "computePredictive") {
      return response.predictive;
    }
    throw new Error(response.ok ? "unexpected response kind" : response.error);
  }

  /**
   * Compute the relational MESH edge between two birth inputs on-device.
   * Both natal contexts are recomputed inside the worker (fast — no chart
   * crosses the boundary); every instant (`referenceInstant`, the synchrony
   * window) is EXPLICIT. Requires a prior successful `boot`.
   */
  public async computeMeshEdge(input: MeshEdgeInput): Promise<MeshEdgeContext> {
    const response = await this.#send({ kind: "computeMeshEdge", id: this.#allocId(), input });
    if (response.ok && response.kind === "computeMeshEdge") {
      return response.meshEdge;
    }
    throw new Error(response.ok ? "unexpected response kind" : response.error);
  }

  public terminate(): void {
    this.#worker.terminate();
  }

  #allocId(): number {
    this.#nextId += 1;
    return this.#nextId;
  }

  #send(request: ChartWorkerRequest): Promise<ChartWorkerResponse> {
    return new Promise<ChartWorkerResponse>((resolve) => {
      this.#pending.set(request.id, { resolve });
      this.#worker.postMessage(request);
    });
  }

  #onMessage(response: ChartWorkerResponse): void {
    const pending = this.#pending.get(response.id);
    if (pending === undefined) {
      return;
    }
    this.#pending.delete(response.id);
    pending.resolve(response);
  }
}
