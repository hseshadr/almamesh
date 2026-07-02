// The Pyodide chart Worker: boots Pyodide, installs the UNCHANGED `almamesh`
// Python engine + its ephemeris, and computes sidereal charts entirely
// in-thread. This is a faithful port of the proven Phase-0 spike
// (/tmp/almamesh-spike/run_full_pyodide.mjs) to a browser module Worker — Node
// `readFileSync` is replaced by bytes delivered in the boot message (synced from
// the signed edge-proc bundle by the runtime).
//
// Exercised end-to-end by the P2.6 harness; the main-thread client that drives
// it (ChartEngineClient) is unit-tested separately against a fake worker.

import { loadPyodide, type PyodideInterface } from "pyodide";

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
} from "./protocol";
import type { RectificationInput, RectificationResultRaw } from "./rectification";

const SKYFIELD_DATA_DIR = "/home/pyodide/.skyfield-data";

// Resolved offline from the self-hosted Pyodide lock (no PyPI/CDN). dateutil,
// pytz, and certifi ship in Pyodide's own lock, so skyfield's pure-Python deps
// need no network — only jplephem/sgp4/skyfield wheels travel in the bundle.
const LOAD_PACKAGES = [
  "micropip",
  "numpy",
  "pydantic",
  "pyyaml",
  "python-dateutil",
  "pytz",
  "certifi",
] as const;

// Defines `_almamesh_generate_chart(birth_json)` once; the engine is the
// unchanged package, called with an explicit reference_date for reproducibility.
//
// Exported so the offline parity/precision integration gates can run the EXACT
// same glue under Pyodide (rather than a drifting copy).
export const PY_BOOTSTRAP = `
import json
from datetime import UTC, datetime
from almamesh.calculations import calculate_sidereal_context

def _almamesh_generate_chart(birth_json):
    birth = json.loads(birth_json)
    dt = datetime.fromisoformat(birth["datetimeUtc"])
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    ref = birth.get("referenceDate")
    reference_date = datetime.fromisoformat(ref) if ref else None
    ctx = calculate_sidereal_context(
        dt, birth["latitude"], birth["longitude"], reference_date=reference_date
    )
    return json.dumps(ctx.model_dump(mode="json"))

def _almamesh_compute_predictive(input_json):
    # The LAZY predictive superset (transits + vargas + strength + domains).
    # referenceInstant is REQUIRED — no silent now(); a KeyError here is a
    # caller bug, surfaced through the worker's error envelope.
    # Imported lazily so booting an OLDER bundled wheel (without the
    # predictive module) still serves natal charts.
    from almamesh.predictive import compute_predictive_contexts
    data = json.loads(input_json)
    dt = datetime.fromisoformat(data["datetimeUtc"])
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    reference = datetime.fromisoformat(data["referenceInstant"])
    ctx = compute_predictive_contexts(dt, data["latitude"], data["longitude"], reference)
    return json.dumps(ctx.model_dump(mode="json"))

def _almamesh_compute_mesh(input_json):
    # The relational MESH edge between TWO bare birth inputs ("a" and "b").
    # Both natal contexts are recomputed here on-device — no chart crosses the
    # worker boundary. Every instant is REQUIRED and explicit (referenceInstant
    # pins both charts' "current" dasha; windowStart/windowEnd bound the dasha
    # synchrony) — a KeyError is a caller bug, surfaced through the worker's
    # error envelope. Imported lazily so booting an OLDER bundled wheel
    # (without the mesh module) still serves natal charts.
    from almamesh.mesh import compute_mesh_edge
    from almamesh.schemas.mesh import MatchRole, Relationship
    data = json.loads(input_json)
    reference = datetime.fromisoformat(data["referenceInstant"])
    def _natal(birth):
        dt = datetime.fromisoformat(birth["datetimeUtc"])
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=UTC)
        return calculate_sidereal_context(
            dt, birth["latitude"], birth["longitude"], reference_date=reference
        )
    edge = compute_mesh_edge(
        _natal(data["a"]),
        _natal(data["b"]),
        relationship=Relationship(data["relationship"]),
        role_a=MatchRole(data["roleA"]),
        role_b=MatchRole(data["roleB"]),
        window_start=datetime.fromisoformat(data["windowStart"]),
        window_end=datetime.fromisoformat(data["windowEnd"]),
    )
    return json.dumps(edge.model_dump(mode="json"))

def _almamesh_compute_rectification(input_json):
    # Birth-time rectification: score user life events against Ascendant-sign
    # candidates and rank them honestly (band = 'near_tie' | 'leans' | 'consistent').
    # referenceDate is OPTIONAL — omit for live non-deterministic use; pass it
    # for reproducible test fixtures. A KeyError here is a caller bug.
    # Imported lazily so an OLDER bundled wheel (without the rectification module)
    # still serves natal charts.
    from almamesh.rectification import compute_rectification_result
    from almamesh.rectification.models import RectificationEventInput, RectificationMode
    data = json.loads(input_json)
    dt = datetime.fromisoformat(data["datetimeUtc"])
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    raw_ref = data.get("referenceDate")
    reference_date = datetime.fromisoformat(raw_ref) if raw_ref else datetime.now(UTC)
    events = [
        # precision drives the approximate-date engine (exact|month|year|approx);
        # default "exact" keeps older callers (no precision key) byte-stable.
        RectificationEventInput(
            date=e["date"], category=e["category"], precision=e.get("precision", "exact")
        )
        for e in data["events"]
    ]
    # Spec 062: spanMinutes (honest window bound) + anchorConfidence (E5 anchor
    # prior) thread through as snake_case kwargs. Both kwargs are OMITTED when
    # the caller omits the field, so absent inputs stay byte-identical and an
    # older wheel (without the kwargs) still serves span-less calls.
    extra_kwargs = {}
    raw_span = data.get("spanMinutes")
    if raw_span is not None:
        extra_kwargs["span_minutes"] = int(raw_span)
    raw_anchor = data.get("anchorConfidence")
    if raw_anchor is not None:
        from almamesh.rectification.models import AnchorConfidence
        extra_kwargs["anchor_confidence"] = AnchorConfidence(str(raw_anchor))
    result = compute_rectification_result(
        dt_utc=dt,
        latitude=data["latitude"],
        longitude=data["longitude"],
        utc_offset_minutes=data["utcOffsetMinutes"],
        events=events,
        mode=RectificationMode(data["mode"]),
        reference_date=reference_date,
        **extra_kwargs,
    )
    return json.dumps(result.model_dump(mode="json"))
`;

// micropip's install is a Python callable; callKwargs forwards keyword args.
interface PyInstall {
  (requirements: string | readonly string[]): Promise<void>;
  callKwargs(url: string, kwargs: { readonly deps: boolean }): Promise<void>;
}
interface Micropip {
  readonly install: PyInstall;
}
interface PyChartFn {
  (birthJson: string): string;
  destroy(): void;
}
interface PyPredictiveFn {
  (inputJson: string): string;
  destroy(): void;
}
interface PyMeshFn {
  (inputJson: string): string;
  destroy(): void;
}
interface PyRectificationFn {
  (inputJson: string): string;
  destroy(): void;
}

let enginePyodide: PyodideInterface | undefined;

async function installEngine(pyodide: PyodideInterface, config: BootConfig): Promise<void> {
  // loadPackage resolves the whole list from the self-hosted lock — offline.
  await pyodide.loadPackage([...LOAD_PACKAGES]);
  const micropip = pyodide.pyimport("micropip") as unknown as Micropip;
  // Install bundled wheels in order, each deps:false: their deps are already
  // loaded above, and deps:true would make micropip resolve against PyPI.
  for (const wheel of config.wheels) {
    pyodide.FS.writeFile(`/${wheel.filename}`, wheel.bytes);
    await micropip.install.callKwargs(`emfs:/${wheel.filename}`, { deps: false });
  }
}

function seedSkyfieldData(pyodide: PyodideInterface, config: BootConfig): void {
  pyodide.FS.mkdirTree(SKYFIELD_DATA_DIR);
  for (const asset of config.skyfieldData) {
    pyodide.FS.writeFile(`${SKYFIELD_DATA_DIR}/${asset.filename}`, asset.bytes);
  }
}

async function boot(config: BootConfig): Promise<void> {
  const pyodide = await loadPyodide({ indexURL: config.pyodideIndexUrl });
  await installEngine(pyodide, config);
  seedSkyfieldData(pyodide, config);
  await pyodide.runPythonAsync(PY_BOOTSTRAP);
  enginePyodide = pyodide;
}

function generateChart(birth: BirthInput): SiderealChart {
  if (enginePyodide === undefined) {
    throw new Error("chart worker not booted");
  }
  const fn = enginePyodide.globals.get("_almamesh_generate_chart") as unknown as PyChartFn;
  try {
    return JSON.parse(fn(JSON.stringify(birth))) as SiderealChart;
  } finally {
    fn.destroy();
  }
}

function computePredictive(input: PredictiveInput): PredictiveContexts {
  if (enginePyodide === undefined) {
    throw new Error("chart worker not booted");
  }
  const fn = enginePyodide.globals.get("_almamesh_compute_predictive") as unknown as PyPredictiveFn;
  try {
    return JSON.parse(fn(JSON.stringify(input))) as PredictiveContexts;
  } finally {
    fn.destroy();
  }
}

function computeMeshEdge(input: MeshEdgeInput): MeshEdgeContext {
  if (enginePyodide === undefined) {
    throw new Error("chart worker not booted");
  }
  const fn = enginePyodide.globals.get("_almamesh_compute_mesh") as unknown as PyMeshFn;
  try {
    return JSON.parse(fn(JSON.stringify(input))) as MeshEdgeContext;
  } finally {
    fn.destroy();
  }
}

function computeRectification(input: RectificationInput): RectificationResultRaw {
  if (enginePyodide === undefined) {
    throw new Error("chart worker not booted");
  }
  const fn = enginePyodide.globals.get("_almamesh_compute_rectification") as unknown as PyRectificationFn;
  try {
    return JSON.parse(fn(JSON.stringify(input))) as RectificationResultRaw;
  } finally {
    fn.destroy();
  }
}

async function handle(request: ChartWorkerRequest): Promise<ChartWorkerResponse> {
  try {
    if (request.kind === "boot") {
      await boot(request.config);
      return { ok: true, kind: "boot", id: request.id };
    }
    if (request.kind === "computePredictive") {
      return {
        ok: true,
        kind: "computePredictive",
        id: request.id,
        predictive: computePredictive(request.input),
      };
    }
    if (request.kind === "computeMeshEdge") {
      return {
        ok: true,
        kind: "computeMeshEdge",
        id: request.id,
        meshEdge: computeMeshEdge(request.input),
      };
    }
    if (request.kind === "computeRectification") {
      return {
        ok: true,
        kind: "computeRectification",
        id: request.id,
        rectification: computeRectification(request.input),
      };
    }
    return { ok: true, kind: "generateChart", id: request.id, chart: generateChart(request.birth) };
  } catch (error) {
    return { ok: false, id: request.id, error: error instanceof Error ? error.message : String(error) };
  }
}

// Register the message handler only inside a real Worker scope. Outside one
// (Node/Bun test harnesses, the offline parity gate) `self` is absent, so this
// module stays importable for its exported `PY_BOOTSTRAP` glue without spawning
// a listener.
const workerScope =
  typeof self !== "undefined" ? (self as unknown as DedicatedWorkerGlobalScope) : undefined;
if (workerScope) {
  workerScope.addEventListener("message", (event: MessageEvent<ChartWorkerRequest>) => {
    void handle(event.data).then((response) => {
      workerScope.postMessage(response);
    });
  });
}
