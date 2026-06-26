// The browser runtime that turns a synced signed bundle into a live, in-tab
// chart engine — the on-device replacement for the FastAPI backend.
//
// Two Workers, off the UI thread:
//   - the sync Worker (edge-proc EngineClient) owns OPFS + the ported sync_index;
//     it pulls the signed, content-addressed bundle, verifies it ed25519+sha256
//     fail-closed, and materializes the wheel + ephemeris;
//   - the Pyodide Worker (ChartEngineClient) boots the unchanged almamesh engine
//     over those bytes and computes charts in-thread.
//
// bootstrap() drives both with a progress callback and is idempotent: the engine
// is booted once and cached. After the first run everything needed lives in
// OPFS, so reloads are offline-capable.

import { EngineClient, type SyncResult } from "@edgeproc/browser/engine";

import type { SiderealChart } from "./chart";
import { ChartEngineClient } from "./chartEngineClient";
import type { MeshEdgeContext } from "./mesh";
import type { PredictiveContexts } from "./predictive";
import type {
  BirthInput,
  BootConfig,
  MeshEdgeInput,
  PredictiveInput,
  PyodideAsset,
} from "./protocol";

/** A bootstrap stage, surfaced to the UI for a real progress story. */
export type BootStage =
  | { readonly kind: "syncing" }
  | { readonly kind: "synced"; readonly result: SyncResult }
  | { readonly kind: "reassembling" }
  | { readonly kind: "booting-engine" }
  | { readonly kind: "ready" };

/** Progress sink; called as bootstrap advances through its stages. */
export type OnStage = (stage: BootStage) => void;

/** Where the bundle is synced from, the pinned key, and the synced asset paths. */
export interface RuntimeConfig {
  readonly bundleBaseUrl: string; // origin serving /latest, /manifest/*, /chunk/*
  readonly pubkeyUrl: string; // pinned ed25519 key, served same-origin as the app
  readonly pyodideIndexUrl: string; // self-hosted Pyodide dist (same-origin app asset)
  // Wheel paths within the bundle, in install order (leaf-first; almamesh last).
  readonly wheelPaths: readonly string[];
  // Skyfield data paths within the bundle (de421.bsp + finals2000A.all).
  readonly skyfieldDataPaths: readonly string[];
}

/** The sync-Worker surface bootstrap needs: pull the bundle, read its files. */
export interface EnginePort {
  sync(baseUrl: string, pubkeyUrl: string): Promise<SyncResult>;
  readFile(path: string): Promise<Uint8Array>;
}

/** The Pyodide-Worker surface bootstrap needs: boot the engine, compute charts. */
export interface ChartEnginePort {
  boot(config: BootConfig): Promise<void>;
  generateChart(birth: BirthInput): Promise<SiderealChart>;
  computePredictive(input: PredictiveInput): Promise<PredictiveContexts>;
  computeMeshEdge(input: MeshEdgeInput): Promise<MeshEdgeContext>;
}

/**
 * Provenance recorded in every signed bundle (`almamesh_meta.json`). This is the
 * wire shape produced by the `almamesh-bundle` publisher (backend
 * `edge/bundle.py` `BundleMeta`) — surfaced to the UI for the per-report
 * "calculated locally" footer (trust through transparency).
 */
export interface BundleMeta {
  readonly bundle_id: string;
  readonly version: string;
  readonly engine_version: string;
  readonly ephemeris_file: string;
  readonly ayanamsa: string;
  readonly constructs: readonly string[];
}

/** The ready engine returned by bootstrap. */
export interface ChartEngine {
  generateChart(birth: BirthInput): Promise<SiderealChart>;
  /**
   * The LAZY predictive payload at an EXPLICIT reference instant. Heavy
   * (~35s under Pyodide) — never part of the natal chart path.
   */
  computePredictive(input: PredictiveInput): Promise<PredictiveContexts>;
  /**
   * The relational MESH edge between two birth inputs, computed on-device
   * (both natal contexts recomputed internally; explicit instants only).
   */
  computeMeshEdge(input: MeshEdgeInput): Promise<MeshEdgeContext>;
  /** Bundle provenance read from the synced `almamesh_meta.json`, if present. */
  meta(): BundleMeta | null;
}

/** The seams bootstrap depends on; defaulted to the real Workers, faked in tests. */
export interface RuntimeDeps {
  readonly spawnSyncEngine: () => EnginePort;
  readonly spawnChartEngine: () => ChartEnginePort;
}

const defaultDeps: RuntimeDeps = {
  spawnSyncEngine: () => EngineClient.spawn(),
  spawnChartEngine: () => ChartEngineClient.spawn(),
};

/** Build the production runtime deps (real sync Worker + real Pyodide Worker). */
export function defaultRuntimeDeps(): RuntimeDeps {
  return defaultDeps;
}

const META_PATH = "almamesh_meta.json";

function basename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

async function loadAsset(engine: EnginePort, path: string): Promise<PyodideAsset> {
  return { filename: basename(path), bytes: await engine.readFile(path) };
}

/**
 * Read the synced bundle provenance. Best-effort: a missing/unreadable meta file
 * must NOT fail bootstrap — the footer just shows nothing — so this returns null
 * on any error rather than throwing.
 */
async function readMeta(engine: EnginePort): Promise<BundleMeta | null> {
  try {
    const bytes = await engine.readFile(META_PATH);
    return JSON.parse(new TextDecoder().decode(bytes)) as BundleMeta;
  } catch {
    return null;
  }
}

export class AlmaMeshRuntime {
  readonly #deps: RuntimeDeps;
  #enginePromise: Promise<ChartEngine> | null = null;
  #ready: ChartEngine | null = null;

  public constructor(deps: RuntimeDeps = defaultDeps) {
    this.#deps = deps;
  }

  /** The ready engine, or null before the first successful bootstrap. */
  public engine(): ChartEngine | null {
    return this.#ready;
  }

  /** Sync the bundle, boot Pyodide, and return the in-tab chart engine. Idempotent. */
  public bootstrap(config: RuntimeConfig, onStage: OnStage = () => {}): Promise<ChartEngine> {
    if (this.#enginePromise === null) {
      this.#enginePromise = this.#build(config, onStage).catch((error: unknown) => {
        this.#enginePromise = null; // let a failed bootstrap be retried
        throw error;
      });
    }
    return this.#enginePromise;
  }

  async #build(config: RuntimeConfig, onStage: OnStage): Promise<ChartEngine> {
    const syncEngine = this.#deps.spawnSyncEngine();
    onStage({ kind: "syncing" });
    const result = await syncEngine.sync(config.bundleBaseUrl, config.pubkeyUrl);
    onStage({ kind: "synced", result });

    onStage({ kind: "reassembling" });
    const [bootConfig, meta] = await Promise.all([
      this.#assembleBootConfig(syncEngine, config),
      readMeta(syncEngine),
    ]);

    onStage({ kind: "booting-engine" });
    const chartEngine = this.#deps.spawnChartEngine();
    await chartEngine.boot(bootConfig);

    const engine: ChartEngine = {
      generateChart: (birth) => chartEngine.generateChart(birth),
      computePredictive: (input) => chartEngine.computePredictive(input),
      computeMeshEdge: (input) => chartEngine.computeMeshEdge(input),
      meta: () => meta,
    };
    this.#ready = engine;
    onStage({ kind: "ready" });
    return engine;
  }

  async #assembleBootConfig(engine: EnginePort, config: RuntimeConfig): Promise<BootConfig> {
    const [wheels, skyfieldData] = await Promise.all([
      Promise.all(config.wheelPaths.map((path) => loadAsset(engine, path))),
      Promise.all(config.skyfieldDataPaths.map((path) => loadAsset(engine, path))),
    ]);
    return { pyodideIndexUrl: config.pyodideIndexUrl, wheels, skyfieldData };
  }
}
