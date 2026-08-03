# Architecture

**TL;DR:** AlmaMesh is a Vedic astrology app with **no server**. The Python
chart engine — the same `almamesh` package you can run on your laptop — runs
*inside the browser tab* under Pyodide (Python compiled to WebAssembly), fed by
an ed25519-signed, content-addressed bundle cached in OPFS. The network carries
delivery metadata and the explicitly disclosed city-search/optional-AI flows;
birth details and computed charts are not sent by the engine or geocoder.

This page is the orientation map. The deep, always-current reference is
[CLAUDE.md](../CLAUDE.md) (tech stack, package table, data contract, quality
gates); the [README](../README.md) carries the product story. Per the portfolio
standard, this repo is the exemplar for the "Pyodide app engine" pattern
(ENGINEERING-STANDARDS §8.1a).

## The delivery + compute flow

![Signed bundle → OPFS → Pyodide engine](assets/delivery-flow.svg)

*Diagram source: [assets/delivery-flow.d2](assets/delivery-flow.d2) (d2, the
house diagram format).*

1. **Build time** — `almamesh-bundle` (the Python CLI in `backend/`) assembles
   the engine wheel, the JPL DE421 ephemeris, and the Pyodide/Skyfield wheels
   into a content-addressed bundle and signs it with an ed25519 key. The
   private key never enters the repo (CI tree-guard enforces it); the public
   key ships with the app as `/public.key`.
2. **Delivery** — the bundle is static files on Cloudflare Pages. One-way:
   nothing ever flows back.
3. **In the tab** — `@almamesh/browser` verifies the signature (fail-closed:
   a bad signature raises, never downgrades), syncs chunks into **OPFS** (the
   browser's private on-disk storage), and boots the **unchanged wheel** under
   Pyodide in a Web Worker. Charts compute off the UI thread, byte-identical
   to CPython — a golden parity gate (`test:parity`) enforces that identity.
4. **UI** — React reshapes `SiderealChart → ChartData` and renders. TypeScript
   never computes astrology (house rule #2).

## Where things live

| Area | Path | Notes |
|---|---|---|
| Python engine + bundle publisher | `backend/src/almamesh/` | Pydantic models, Skyfield astronomy, dasha/yoga/mesh/rectification engines |
| Signed-bundle delivery core | `edge-proc` (PyPI) | pinned `>=0.3.0` in `backend/pyproject.toml` — the first release whose anti-replay guard fails closed |
| Browser engine + PWA | `frontend/` (Bun workspace) | packages table in [CLAUDE.md](../CLAUDE.md#frontend-monorepo-packages-frontendpackages) |
| Specs (numbered) | `docs/specs/` | feature design records |
| Deploy | `.github/workflows/deploy.yml` → Cloudflare Pages | key custody in the workflow header + `docs/deploy/` |

## Load-bearing invariants

- **Determinism:** same inputs → byte-identical chart on CPython and Pyodide.
- **Zero egress on the chart path;** exactly two disclosed opt-in egresses
  (cloud AI, birthplace geocoding) — see the data-contract section of
  [CLAUDE.md](../CLAUDE.md#data-contract-no-api-its-a-transform--signed-bundle).
- **Client-side data is sacred:** storage formats, cache names, and the bundle
  verify key are compatibility surfaces for real users — never change them
  casually.
