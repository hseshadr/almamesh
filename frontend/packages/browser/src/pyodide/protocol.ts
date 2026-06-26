// The postMessage wire contract between the main thread and the Pyodide chart
// Worker. Discriminated on `kind`/`ok`, correlated by `id` — mirroring the
// edge-proc EngineClient/worker protocol.

import type { SiderealChart } from "./chart";
import type { MatchRole, MeshEdgeContext, MeshRelationship } from "./mesh";
import type { PredictiveContexts } from "./predictive";

/** Birth data for a chart. `referenceDate` pins the "current" dasha for reproducibility. */
export interface BirthInput {
  readonly datetimeUtc: string; // ISO-8601 UTC
  readonly latitude: number;
  readonly longitude: number;
  readonly referenceDate?: string; // ISO-8601; omit to use the wall clock
}

/**
 * Input for the LAZY predictive computation (transits + vargas + strength +
 * life domains). Unlike `BirthInput.referenceDate`, `referenceInstant` is
 * REQUIRED — the engine never silently reads the wall clock; the caller pins
 * the instant, which pins both the "current" dasha and the transit "now".
 */
export interface PredictiveInput {
  readonly datetimeUtc: string; // ISO-8601 UTC birth instant
  readonly latitude: number;
  readonly longitude: number;
  readonly referenceInstant: string; // ISO-8601 — explicit, never wall-clock
}

/** One bare birth input of a mesh pair — the worker recomputes its chart on-device. */
export interface MeshBirthInput {
  readonly datetimeUtc: string; // ISO-8601 UTC birth instant
  readonly latitude: number;
  readonly longitude: number;
}

/**
 * Input for the relational MESH edge between TWO birth inputs. No chart
 * crosses the worker boundary: both natal contexts are recomputed internally
 * (fast, deterministic). Every instant is REQUIRED and explicit —
 * `referenceInstant` pins both charts' "current" dasha, `windowStart`/
 * `windowEnd` bound the dasha synchrony; the engine never reads the wall
 * clock. Roles are explicit per the engine's no-guessing Melapaka rule.
 */
export interface MeshEdgeInput {
  readonly a: MeshBirthInput;
  readonly b: MeshBirthInput;
  readonly relationship: MeshRelationship;
  readonly roleA: MatchRole;
  readonly roleB: MatchRole; // must differ from roleA (engine-enforced)
  readonly windowStart: string; // ISO-8601 — synchrony window, explicit
  readonly windowEnd: string; // ISO-8601 — synchrony window, explicit
  readonly referenceInstant: string; // ISO-8601 — explicit, never wall-clock
}

/** A binary asset seeded into the Pyodide filesystem (e.g. the ephemeris). */
export interface PyodideAsset {
  readonly filename: string;
  readonly bytes: Uint8Array;
}

/**
 * Everything the worker needs to boot Pyodide OFFLINE and load the AlmaMesh
 * engine. `pyodideIndexUrl` points at a self-hosted Pyodide dist (its own
 * wasm + the numpy/pydantic/pyyaml/dateutil/pytz/certifi lock), so loadPackage
 * never touches the CDN. `wheels` + `skyfieldData` come from the signed bundle.
 */
export interface BootConfig {
  readonly pyodideIndexUrl: string;
  // Wheels installed in array order, each deps:false — caller orders leaf-first
  // (jplephem, sgp4, skyfield, ...) with the almamesh engine wheel last. Each
  // `filename` MUST keep wheel naming so micropip can parse name/version.
  readonly wheels: readonly PyodideAsset[];
  // Seeded into ~/.skyfield-data so the Skyfield Loader + timescale stay offline:
  // de421.bsp AND finals2000A.all (the latter is fetched from IERS if absent).
  readonly skyfieldData: readonly PyodideAsset[];
}

export interface BootRequest {
  readonly kind: "boot";
  readonly id: number;
  readonly config: BootConfig;
}

export interface GenerateChartRequest {
  readonly kind: "generateChart";
  readonly id: number;
  readonly birth: BirthInput;
}

export interface ComputePredictiveRequest {
  readonly kind: "computePredictive";
  readonly id: number;
  readonly input: PredictiveInput;
}

export interface ComputeMeshEdgeRequest {
  readonly kind: "computeMeshEdge";
  readonly id: number;
  readonly input: MeshEdgeInput;
}

export type ChartWorkerRequest =
  | BootRequest
  | GenerateChartRequest
  | ComputePredictiveRequest
  | ComputeMeshEdgeRequest;

export interface BootOk {
  readonly ok: true;
  readonly kind: "boot";
  readonly id: number;
}

export interface ChartOk {
  readonly ok: true;
  readonly kind: "generateChart";
  readonly id: number;
  readonly chart: SiderealChart;
}

export interface PredictiveOk {
  readonly ok: true;
  readonly kind: "computePredictive";
  readonly id: number;
  readonly predictive: PredictiveContexts;
}

export interface MeshEdgeOk {
  readonly ok: true;
  readonly kind: "computeMeshEdge";
  readonly id: number;
  readonly meshEdge: MeshEdgeContext;
}

export interface WorkerErr {
  readonly ok: false;
  readonly id: number;
  readonly error: string;
}

export type ChartWorkerResponse = BootOk | ChartOk | PredictiveOk | MeshEdgeOk | WorkerErr;

/**
 * The minimal Worker surface the client depends on, so tests can inject a fake
 * worker without a real thread (the worker is an I/O boundary).
 */
export interface WorkerLike {
  postMessage(message: ChartWorkerRequest): void;
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<ChartWorkerResponse>) => void,
  ): void;
  terminate(): void;
}
