# Cleverness Debt

TL;DR: AlmaMesh keeps only the unusual boundaries that protect determinism,
browser isolation, or load cost. This ledger says what was removed, what needs a
real consumer before redesign, and what is intentionally accepted with an
executable proof. It is an inventory, not permission to spread these patterns.

To audit the contract locally:

```bash
cd backend
uv run poe lint && uv run poe typecheck && uv run poe complexity && uv run poe test
cd ../frontend
bun run --filter @almamesh/web test:unit -- src/lib/__tests__/repositoryTruth.test.ts
```

## Remove now

| Boundary | Evidence | Covering test |
| --- | --- | --- |
| Edge chart payload number casts | Eight `float(object)` sites in `edge/chart_runtime.py` repeated the same type ignore and accidentally admitted booleans and non-finite values. One private `_parse_payload_number` now owns the wire boundary and fails with the field name. | `backend/tests/test_edge_chart_runtime.py` covers finite integers, floats, numeric strings, null, booleans, invalid text, `NaN`, and positive/negative infinity. |
| Mutable settings singleton | `_settings` and the eager `settings` instance created two module-owned lifecycles. `functools.cache` now makes `get_settings()` the sole factory and exposes the standard `cache_clear()` test seam. | `backend/tests/test_config.py::test_should_cache_settings_until_explicit_test_reset` |
| Suppressed calculation import order | `calculations.py` had two unexplained late imports even though neither dependency imports `calculations`. They now live in the normal import block with no `E402` suppression. | `backend/tests/test_imports.py::test_should_import_calculations_without_suppressed_late_imports` |

## Redesign only with a named consumer

| Boundary | Why a broad rewrite is riskier | Trigger |
| --- | --- | --- |
| JSON metadata in `dasha.models.Signal.features` | The dormant composite-dasha engine emits several small metadata shapes, while only internal scoring currently reads `karaka`. Replacing the mapping speculatively would couple unrelated emitters or invent a public schema for an unshipped surface. | A shipped UI, report, or API names the exact metadata fields it consumes; add a discriminated Pydantic model for that consumer and migrate its producers together. |
| Downstream raw Skyfield position mappings | `calculations.py::get_planetary_positions` emits mixed `dict[str, Any]` records that continue through `transits/positions.py`, `transits/aspects.py`, and `transits/gochara.py`. Replacing that shared internal shape piecemeal risks natal/transit drift. | Before adding another consumer of `get_planetary_positions()` or another astronomy provider, introduce one typed raw-position record and migrate the producer plus all three transit modules together. |
| GSAP lazy-load cache | `animations/storytelling/lazyLoad.ts` owns a promise plus two module caches, but production code only re-exports the helpers. Adding reset/retry machinery without a route consumer would preserve unused complexity rather than clarify it. | A named route imports the loader; first add a concurrency test and a failed-import retry/reset test, then collapse the cache behind one injectable owner. |
| mutable store counters | `profiles`, `lifeEvents`, and `chat` use module counters only as a fallback when `crypto.randomUUID` is absent. Reworking IDs can affect persisted references, migrations, backups, and cross-store cascades. | A supported runtime without `crypto.randomUUID`, or a regression proving a fallback collision, becomes a named consumer; inject one ID factory per store creator and preserve the persisted string shape. |

## Accepted boundary

| Boundary | Why it is legitimate | Isolation/reset proof |
| --- | --- | --- |
| Skyfield type edge | Skyfield's `Time`, ephemeris vectors, and discrete-event arrays are untyped upstream. Those direct library edges remain in `calculations.py` and `strength/sunrise.py`; the downstream raw position-mapping debt is classified separately above. Pydantic chart models remain the typed public output boundary. | `test_positions_apparent.py`, `test_node_speed.py`, `test_lagna_obliquity.py`, and `test_shadbala_components.py` exercise the adapter outputs. |
| PEP 562 lazy import | `almamesh.dasha.__getattr__` keeps dormant heuristic scoring outside the deterministic chart import closure while preserving the historical package API. Eager imports would weaken that calculation-integrity boundary. | `backend/tests/test_scoring_quarantine.py` probes the chart closure in a fresh Python interpreter. |
| Shadbala classical-argument shape | `_assemble` names the planet plus all six classical bala components and the computed total. Keeping those typed arguments visible is clearer than hiding the canonical six-fold record in an untyped bag. | `backend/tests/test_shadbala_components.py` and `backend/tests/test_shadbala_golden.py` verify component and total semantics. |
| Pyodide worker singletons | `enginePyodide` is isolated inside its dedicated Worker, and each `AlmaMeshRuntime` memoizes one boot promise so concurrent callers cannot boot duplicate 38 MB engines. A failed bootstrap clears the memo. | `runtime.test.ts` proves idempotency and failure reset; `chartEngineClient.test.ts` proves request isolation and Worker termination. |
| Cross-store active-profile scopes | `chartLibrary.activeProfileScope` and `chat.activeChatScope` are the two named module-scope coordination values. Their setter-only boundary lets profile selection publish identity without either consumer importing the profiles store and creating a store cycle; neither value contains chart or conversation content. | `chartLibrary.test.ts` resets its scope to `null` and proves scoped chart selection; `useChatScopeSync.test.tsx` resets the chat scope and proves initial/change synchronization; `profileMigration.test.ts` resets both together before migration cases. Migration trigger: when a shared injected profile-scope coordinator or persisted-selector boundary can replace both values without a circular import, migrate the two stores together and retain the explicit reset contract. |
| Semantic chat cache | One chat-memory facade prevents duplicate embedding workers and model loads. It is injectable and has an explicit reset seam, so tests never share the heavy worker. | `chatMemory.test.ts`, `ChatPanel.test.tsx`, and `useChatThread.test.tsx` call `__resetMemoryForTest()` around cases. |
| Immutable geocoder cache | `cityDbPromise` memoizes only the bundled, read-only city JSON. Queries allocate fresh scored/result arrays, so user input and results never enter the cache. | `cityLookup.test.ts` runs repeated independent offline queries; `cityLookup.online.test.ts` proves online/fallback isolation. |
