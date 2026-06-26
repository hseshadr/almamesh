# Deploying https://almamesh.com (Cloudflare Pages)

**TL;DR** — almamesh.com is a static deploy of `frontend/apps/web/dist` to
Cloudflare Pages. There is no server: the dist folder IS the product (PWA shell
+ Pyodide engine + ed25519-signed chart bundle + self-hosted models/fonts, all
same-origin). Build it with one script, upload it with one wrangler command:

```bash
# one-time: production signing key (READ "Key custody" below FIRST)
cd backend && uv run almamesh-bundle keygen ./keys-prod

# every release: sign with the prod key + real production build → apps/web/dist
bash frontend/apps/web/scripts/build-prod.sh

# deploy (orchestrator/owner runs these — needs `wrangler login` or CLOUDFLARE_API_TOKEN)
npx wrangler pages project create almamesh --production-branch=main   # once
cd frontend/apps/web && npx wrangler pages deploy dist --project-name=almamesh --branch=main
```

Then attach the domain (once): Cloudflare dashboard → **Workers & Pages →
almamesh → Custom domains → Set up a custom domain → `almamesh.com`**. The
almamesh.com zone already lives on this Cloudflare account, so Cloudflare
creates the CNAME record itself. (No wrangler subcommand exists for this; the
API equivalent is `POST /accounts/{account_id}/pages/projects/almamesh/domains`.)
Add `www.almamesh.com` the same way if wanted.

---

## Key custody — the one rule that cannot be broken

The chart engine only runs bundles whose ed25519 signature verifies against the
public key pinned in the build (`dist/public.key`). Installed clients keep that
pin (PWA + service worker + OPFS).

- **The production private key is `backend/keys-prod/private.key`** (gitignored;
  the whole `backend/keys-prod/` + `backend/origin-prod/` dirs are ignored).
- **Losing it = every installed client stops accepting bundle updates** until
  they are re-onboarded against a new pin shipped in a new app build. Treat it
  like a release-signing key.
- **Back it up OUTSIDE the repo and outside this machine** immediately after
  keygen — e.g. a password manager secure note / encrypted vault:

  ```bash
  base64 < backend/keys-prod/private.key   # store this string + the public.key one
  base64 < backend/keys-prod/public.key
  ```

- **Never commit it, never print it into CI logs.** `.gitignore` covers
  `backend/keys-prod/`, plus `private.key` by name everywhere; CI restores it
  from a secret and shreds it after the build.
- Generating a key is deliberately manual (`build-prod.sh` fails closed if the
  keypair is missing instead of minting one) — an accidental fresh key would
  silently rotate the pin and orphan every installed client.
- The **dev** keypair (`backend/keys/`, written by `setup-dev-assets.sh`) is
  throwaway and unrelated. Local dev keeps using it; `build-prod.sh` swaps the
  production bundle + production `public.key` into `public/` for the artifact
  (re-run `setup-dev-assets.sh` or `uv run poe demo-fresh` to restore the dev
  bundle afterwards).

## Rebuild → re-sign → redeploy (every release)

```bash
# 0. prereqs (once per machine): bun install done, dev assets fetched
cd frontend && bun install
bash apps/web/scripts/setup-dev-assets.sh     # pyodide dist + models + skyfield data

# 1. build the artifact — signs the bundle with backend/keys-prod, labels it
#    with the latest git tag (override: BUNDLE_VERSION=v9.9.9 …), then runs the
#    REAL production build: VITE_API_URL empty, exit-gate hooks OFF.
bash apps/web/scripts/build-prod.sh

# 2. sanity: the script already asserts _headers/_redirects/public.key/bundle/
#    pyodide are in dist and that dist/public.key == keys-prod/public.key.

# 3. deploy
cd apps/web && npx wrangler pages deploy dist --project-name=almamesh --branch=main
```

Bundle updates for already-installed clients flow through `/bundle/latest`
(no-cache) → new manifest hash → content-addressed chunk sync into OPFS,
verified against the pinned key. App-shell updates flow through `sw.js`
(no-cache) → the in-app "update available" prompt.

### CI variant (auto-deploy after CI, + manual GitHub Action)

`.github/workflows/deploy.yml` does the same thing on ubuntu-latest. It triggers
**automatically after the "Test" workflow passes on `main`** (deploying the exact
commit that passed CI) and also on manual `workflow_dispatch`. It is inert until
these repo secrets exist — when they are absent the **auto-run skips cleanly**
(no red X on every push); a **manual run fails fast** at the guard step.

| Secret | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | API token with Pages:Edit on the account |
| `CLOUDFLARE_ACCOUNT_ID` | the account that owns the project + zone |
| `BUNDLE_PRIVATE_KEY_B64` | `base64 < backend/keys-prod/private.key` |
| `BUNDLE_PUBLIC_KEY_B64` | `base64 < backend/keys-prod/public.key` |

**Activation order (important):** do the one-time human setup FIRST — `wrangler
login`, `wrangler pages project create almamesh --production-branch=main`, attach
the `almamesh.com` custom domain, back up `backend/keys-prod/private.key`
off-machine, then add the four secrets above. Once the secrets exist, the next
green CI run on `main` auto-deploys. Until then nothing ships and main stays green.

## What `dist/` must contain (and why)

| Path | Caching (see `public/_headers`) | Role |
|---|---|---|
| `index.html`, `/` + SPA routes | `no-cache` | app shell (SW precaches it) |
| `assets/*` (hashed) | immutable, 1y | JS/CSS chunks |
| `sw.js`, `manifest.webmanifest`, `version.json` | `no-cache` | update signals |
| `workbox-*.js` (hashed) | immutable, 1y | SW runtime |
| `public.key` | `no-cache` | pinned ed25519 verify key |
| `bundle/latest` | `no-cache` | MUTABLE bundle pointer |
| `bundle/chunk(s)/*`, `bundle/manifest(s)/*` | immutable, 1y | content-addressed (sha256 names) |
| `pyodide/*` | immutable, 1y | version-pinned WASM runtime |
| `models/*` | immutable, 1y | self-hosted MiniLM + ort wasm |
| `fonts/*`, `planets/*` | 1y / 1d | self-hosted assets |
| `_headers`, `_redirects` | n/a (parsed by Pages, not served) | this config |

Size: ~189 MB / ~1,290 files (sourcemaps included), largest file ~23 MB
(`models/Xenova/.../model_quantized.onnx`) — under the Pages **25 MiB/file**
cap; file count is far below the 20,000-file cap.

## Pages behaviors we verified (don't re-litigate, re-test)

Verified empirically against `wrangler pages dev` (same asset-serving code as
production) — re-run the probe if Cloudflare semantics are ever in doubt:

1. **`/* /index.html 200` in `_redirects` does NOT shadow real assets** —
   `/assets/*.js`, `/bundle/latest` (extensionless), `/pyodide/*` are still
   served as themselves; only unmatched paths fall back to the shell. (The docs'
   "redirects are always followed" caveat applies to true 3xx redirects.)
   Without `_redirects`, Pages' implicit SPA rendering does the same; the file
   makes it explicit and survives a future `404.html`.
2. **`_headers` rules MERGE same-name headers across matching rules** —
   `/*` + `/assets/*` both setting `Cache-Control` yields
   `no-cache, public, max-age=…, immutable` (browsers then treat it as
   no-cache). Every specific rule therefore detaches first (`! Cache-Control`)
   before setting its own. Do not remove the `!` lines.
3. **No COOP/COEP** — deliberate. The app runs non-cross-origin-isolated
   (Pyodide module workers; the embedder pins `numThreads=1` accordingly).
   Adding them changes worker/embedder behavior. Don't.
4. Content types: Pages serves `.wasm` as `application/wasm`, `.js` as
   `application/javascript`; extensionless bundle files (`latest`, sha256
   chunks) come back as octet-stream and are consumed via `fetch()` — fine.

## Verifying an artifact before deploy

```bash
# closest-to-production local serve (honors _headers/_redirects):
cd frontend/apps/web && bunx wrangler pages dev dist --port 8788
# then drive the real engine against http://127.0.0.1:8788 with the project's
# Playwright Chromium: onboard a chart → dashboard → /predictive → /mesh,
# console clean. NOTE: scripts/verify-exit-gate.mjs CANNOT run against this
# artifact — it needs a VITE_EXIT_GATE_HOOKS=1 build (CI's exit-gate job covers
# that on every push); the production artifact deliberately ships without hooks.
```
