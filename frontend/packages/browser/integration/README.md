# Parity exit-gate — `integration/parity.mjs`

**TL;DR:** Proves the in-browser engine computes the *exact same chart* as the
trusted backend — byte-for-byte — with **zero network**. This is the P2.6 exit
gate: if it passes, the unchanged `almamesh` Python wheel running under Pyodide
== CPython.

## Run it

```bash
# from frontend/packages/browser
node integration/parity.mjs
# or, equivalently:
bun run test:parity
```

Exit `0` = all 5 fixtures byte-identical and offline. Exit non-zero = mismatch
or a network access was attempted (the script prints the first diff path).

It is **deliberately not** part of `bun run test` (vitest) — it boots ~38 MB of
Pyodide (~1.3 s cold) and would slow the unit suite. Keep it separate.

## Why this exists

The browser engine does **not** reimplement the astrology math in TypeScript. It
runs the *unchanged* `almamesh` Python wheel under Pyodide. So the only thing
worth proving is **parity**: same inputs → same bytes out as CPython. This gate
is that proof.

It compares against the committed CPython golden
`backend/tests/fixtures/chart_golden_de421.json` (built by
`backend/tests/test_chart_golden.py`), using the **same** entrypoint the chart
Worker uses and the **same** canonicalization the golden was made with.

Two details that, if wrong, silently break parity:

- **Fixed `reference_date` = `2025-01-01T00:00:00+00:00`.** This pins the
  "current" Vimshottari maha dasha. A wall-clock reference would make
  `dashas.current_maha` drift over time and the comparison would (correctly)
  fail. Must match `FIXED_REFERENCE_DATE` in the golden builder.
- **Float canonicalization to 6 decimals, recursively, bool preserved, keys
  sorted.** Identical to `_canonicalize` in the golden builder, so trivial
  last-bit float noise never trips the gate — but anything above 1e-6 does.

## Inputs (all local — nothing is fetched)

The script references the proven P0 offline spike dirs rather than duplicating a
38 MB runtime into the repo. The chart Worker receives the equivalent bytes
synced from the signed edge-proc bundle at runtime.

| Input | Path |
|-------|------|
| Pyodide dist (runtime + base wheels + lock) | `/private/tmp/almamesh-spike/pyodide-dist/` |
| skyfield-stack wheels (jplephem, sgp4, skyfield) | `/private/tmp/almamesh-spike/offline-wheels/` |
| almamesh engine wheel | `backend/dist/almamesh-0.1.0-py3-none-any.whl` |
| DE421 ephemeris + IERS data | `~/.skyfield-data/{de421.bsp,finals2000A.all}` |
| CPython golden | `backend/tests/fixtures/chart_golden_de421.json` |

Rebuild the engine wheel if absent:

```bash
cd backend && uv build --wheel
```

A `globalThis.fetch` tripwire hard-fails any `http(s)://` request, so a green run
is itself proof the boot + compute touched no network.

## What a real browser harness still needs (beyond this gate)

This node gate proves *compute parity* against the golden. The remaining
**manual / browser** verification — not covered here — is the engine running in
an actual browser:

- A **real `Worker`** (`src/pyodide/chartWorker.ts`) booted from a **served
  origin** (HTTPS/localhost), receiving wheel + ephemeris **bytes** in the boot
  message rather than `readFileSync`.
- **OPFS sync** of the signed edge-proc bundle (the `@edgeproc/browser` sync
  tier) into Origin-Private FileStorage, then handing those bytes to the worker.
- Cross-origin isolation headers (`COOP`/`COEP`) if/when threaded Pyodide is
  used.

That harness page is the P2.6 *browser* verification; this script is the P2.6
*offline byte-parity* verification.
