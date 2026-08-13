# Local node parity helper — `integration/parity.mjs`

> **This is not the byte-parity gate, and CI does not run it.**
>
> The gate is
> [`apps/web/scripts/verify-browser-parity.mjs`](../../../apps/web/scripts/verify-browser-parity.mjs),
> which drives the **real browser Worker** from a served origin on every PR and
> push to `main`. Node-hosted Pyodide is a different host with different worker
> semantics and different asset delivery, so a green run here says nothing about
> what users actually run. This file used to call itself "the P2.6 exit gate"
> while no workflow referenced it; that claim was false and has been removed.

**What it is now:** a debugging aid. It compares the committed CPython golden
against Pyodide hosted in *node*, which is useful when you want to bisect an
engine change without a browser in the loop.

**It does not run out of the box.** It needs a hand-provisioned ~38 MB spike
directory (see [Inputs](#inputs-all-local--nothing-is-fetched)) that no script in
this repo creates; without it the script exits on `missing required input`.

```bash
# from frontend/packages/browser — only after provisioning the inputs below
node integration/parity.mjs
# or, equivalently:
bun run test:parity
```

Exit `0` = all fixtures byte-identical and offline. Exit non-zero = mismatch or a
network access was attempted (the script prints the first diff path).

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

## What the browser gate covers that this script cannot

Everything below is why the CI gate lives in a browser and this script does not
gate anything. This script reads wheels off disk with `readFileSync` and calls
the Python entrypoint in-process; the shipped app does none of that.

| | `parity.mjs` (here) | `verify-browser-parity.mjs` (the gate) |
|---|---|---|
| Host | node | headless Chromium, served origin |
| Execution | in-process | a real `Worker`, off the UI thread |
| Asset delivery | `readFileSync` from a spike dir | signed edge-proc bundle synced into OPFS |
| Reference date | hardcoded constant | required CLI argument |
| Proves the date reaches the engine | no | yes — sensitivity control |
| Runs in CI | no | yes, every PR and push to `main` |
| Fixtures | 6 of 7 golden entries | all 7, enforced against the golden's key set |
