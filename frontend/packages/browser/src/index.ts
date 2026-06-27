// @almamesh/browser — the in-browser, local-first AlmaMesh engine.
//
// AlmaMesh runs entirely on-device: a signed edge-proc bundle (ephemeris +
// rules + the almamesh wheel + Pyodide/numpy/skyfield wheels) is synced into
// OPFS, then the chart is computed in a Web Worker by the UNCHANGED Python
// engine under Pyodide. No backend, no account.
//
// The signed-bundle sync + OPFS + Worker tier is reused verbatim from
// @edgeproc/browser/engine (the proven edge-reco pattern); this package layers
// the Pyodide chart compute on top (see ./pyodide, added in P2.3).

// --- the reused sync foundation (edge-proc browser tier) ---
export {
  EngineClient,
  materializeFile,
  MemoryCacheStore,
  OpfsCacheStore,
  syncIndex,
} from "@edgeproc/browser/engine";
export type {
  CacheStore,
  FetchBytes,
  IndexManifest,
  SyncResult,
  Verify,
  VersionPointer,
} from "@edgeproc/browser/engine";

// --- the runtime: sync the bundle -> boot Pyodide -> on-device chart engine ---
export { AlmaMeshRuntime, defaultRuntimeDeps } from "./pyodide/runtime";
export type {
  BootStage,
  BundleMeta,
  ChartEngine,
  EnginePort,
  ChartEnginePort,
  OnStage,
  RuntimeConfig,
  RuntimeDeps,
} from "./pyodide/runtime";

// --- the Pyodide chart engine (compute layer) ---
export { ChartEngineClient } from "./pyodide/chartEngineClient";
export type {
  HouseCusp,
  LagnaData,
  PlanetPosition,
  DashaPeriod,
  MahaDashaPeriod,
  SiderealChart,
  VimshottariDasha,
  YogaData,
  YogaFormationRule,
  YogaGrade,
  YogaStrengthFactor,
} from "./pyodide/chart";
export type {
  BirthInput,
  BootConfig,
  MeshBirthInput,
  MeshEdgeInput,
  PredictiveInput,
  PyodideAsset,
} from "./pyodide/protocol";
export type { PredictiveContexts } from "./pyodide/predictive";
export type { MeshEdgeContext } from "./pyodide/mesh";
export type {
  EventEvidenceRaw,
  RectificationCandidateRaw,
  RectificationInput,
  RectificationResultRaw,
} from "./pyodide/rectification";
