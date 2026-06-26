# Go-Live checklist — activate almamesh.com auto-deploy

**TL;DR.** The Cloudflare Pages pipeline is fully built and wired to **auto-deploy
on every green push to `main`** — but it is deliberately **inert** until you do a
one-time setup that only the repo owner can do (it needs your Cloudflare account
and the production signing key). This file is the exact, copy-pasteable sequence.

Until you finish this, nothing deploys and `main` stays green (the auto-deploy job
**skips cleanly** when the secrets are absent).

> Background / architecture: [`almamesh-com.md`](./almamesh-com.md). The CI workflow
> is `.github/workflows/deploy.yml`; the prod build script is
> `frontend/apps/web/scripts/build-prod.sh`.

## Quickest path: one command

```bash
./scripts/go-live-almamesh.sh
```

This script does everything mechanical for you — backs nothing up silently (it
shows the key and makes you confirm you saved it), runs `wrangler login`, creates
the Pages project, base64-encodes the keys, sets all four GitHub secrets, and
triggers + watches the first deploy. It pauses only for the two things that need
you: the browser login and pasting your Cloudflare API token. It is safe to
re-run (every step checks state first). The manual steps below are the same
sequence, documented in full if you prefer to do it by hand.

---

## ✅ Status — the 2026-06-21 go-live run (first deploy is LIVE)

The first production deploy is **done**, driven manually from the owner's Mac
(`wrangler` already logged in). Recorded here so the checklist matches reality:

- ✅ **Prod signing key backed up** off-machine (1Password). It is now load-bearing
  (clients pin it) — never rotate casually.
- ✅ **Pages project `almamesh` exists** (prod branch `main`) — Step 2 already done.
- ✅ **First deploy shipped** — `build-prod.sh` (prod-signed `v0.3.0` bundle) →
  `wrangler pages deploy dist` → **live at `https://almamesh.pages.dev`**. Validated
  end-to-end in headless Chromium through the REAL onboarding journey (no exit-gate
  hooks): chart renders on `/dashboard`, **zero cross-origin on the chart path**
  (zero-egress confirmed), `/public.key` matches the prod pin, `/bundle/latest`
  signature valid, `/report` PDF downloads. No console errors.
- ✅ **Custom domains attached** to the project via API — `almamesh.com` +
  `www.almamesh.com` (the zone is active in this account).
- ✅ **All 4 CI secrets set** — `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`,
  `BUNDLE_PRIVATE_KEY_B64`, `BUNDLE_PUBLIC_KEY_B64` → **auto-deploy is ARMED**.

## ✅✅ GO-LIVE COMPLETE — `almamesh.com` is fully live (2026-06-22)

The two formerly-remaining manual dashboard steps are **done**:

1. ✅ **DNS** — the stale Render records were deleted (apex `A` → `216.24.57.8/9`,
   `www` `CNAME` → `almamesh-web.onrender.com`) and replaced with two **proxied**
   `CNAME` records → `almamesh.pages.dev` (name `@` + `www`). Both auto-validated and
   issued TLS. Verified live: apex + `www` resolve via the CF proxy, 200 + valid cert,
   serve the SPA, `/public.key` matches the prod pin, `/bundle/latest/meta.json` 200.
2. ✅ **`CLOUDFLARE_API_TOKEN`** — set (all four secrets present; the next merge to
   `main` auto-deploys).

**Re-validated end-to-end** by a Playwright agent driving REAL onboarding against the
live `https://almamesh.com` origin (fresh OPFS): the ~38 MB engine boots, a chart
renders on `/dashboard`, console is clean, and there are **zero cross-origin requests
on the chart path** (zero-egress holds). The retryable warming/recovery card works.

> ⚠️ Two non-blocking follow-ups surfaced in that validation: (a) Cloudflare
> **Web Analytics** auto-injects a `static.cloudflareinsights.com` beacon at the edge
> — disable it (Web Analytics → automatic setup off) to keep the zero-egress promise
> literally true; (b) **cold first-load is slow** (400–600 tiny bundle chunks; ~85 s
> cold vs ~2 s warm) — future P-fix (HTTP/2 multiplexing / fewer-larger objects).

The rest of this file is the full reference for re-running or auditing the pipeline.

---

## What you're activating

```
push to main ──► "Test" workflow (gates) ──► passes ──► deploy.yml (workflow_run)
                                                          │
                                                  preflight: secrets set?
                                                   ├─ no  → SKIP (main stays green)
                                                   └─ yes → build-prod.sh
                                                            (sign 38 MB bundle with
                                                             prod ed25519 key) →
                                                            wrangler pages deploy →
                                                            almamesh.com
```

The deploy job signs the engine bundle **inside GitHub Actions** with your prod
private key (restored from a secret, used, then shredded). This is why the key has
to become a GitHub secret — and why protecting it matters (see Step 1).

---

## ⛔ Step 0 — Prerequisites (have these ready)

- A **Cloudflare account** that owns (or will own) the `almamesh.com` zone.
  - The domain's DNS should be managed by Cloudflare (nameservers pointed at CF).
- `wrangler` available locally — `npx wrangler --version` (no global install needed).
- `gh` CLI authenticated against `hseshadr/almamesh` — `gh auth status`.
- The production signing keypair present locally (it already is):
  - `backend/keys-prod/private.key` (32 bytes, mode 600)
  - `backend/keys-prod/public.key` (32 bytes)
  - Both are **gitignored** — they must never be committed.

---

## 🔑 Step 1 — Back up the production signing key (DO THIS FIRST)

`backend/keys-prod/private.key` is the **one** ed25519 key that every installed
client pins. If you lose it you **cannot** publish a new bundle that existing
clients will trust — they'd all have to re-onboard. It currently exists **only on
this Mac** (gitignored). Back it up to durable, private storage (password manager
/ encrypted vault) **before** it goes anywhere else.

```bash
cd /path/to/almamesh

# Copy both keys somewhere safe and OFF this machine (e.g. 1Password "AlmaMesh prod
# bundle signing key"). Store the raw files AND their base64 (used for the secrets):
base64 < backend/keys-prod/private.key    # → save as BUNDLE_PRIVATE_KEY_B64
base64 < backend/keys-prod/public.key     # → save as BUNDLE_PUBLIC_KEY_B64

# Sanity: each key is exactly 32 bytes.
wc -c backend/keys-prod/private.key backend/keys-prod/public.key   # → 32 each
```

**Do not** run `almamesh-bundle keygen` again for prod — that mints a NEW key and
silently rotates the pin. `build-prod.sh` fails closed rather than minting one, on
purpose.

---

## ☁️ Step 2 — Create the Cloudflare Pages project + custom domain

One-time, done by a human with `wrangler`. Project name **must** be `almamesh`
(the workflow passes `--project-name=almamesh`) and the production branch **must**
be `main`.

```bash
# Authenticate wrangler against your Cloudflare account (opens a browser).
npx wrangler login

# Create the Pages project (production branch = main).
npx wrangler pages project create almamesh --production-branch=main

# Note your Account ID — you'll need it for the secret in Step 4:
npx wrangler whoami        # prints the account name + Account ID
```

**Attach the custom domain `almamesh.com`.** There is no `wrangler` subcommand for
this; use the Cloudflare dashboard (recommended):

> Cloudflare dashboard → **Workers & Pages** → **almamesh** → **Custom domains** →
> **Set up a custom domain** → enter `almamesh.com` (and optionally `www.almamesh.com`).
> Cloudflare provisions DNS (apex CNAME-flattening) + TLS automatically.

(API equivalent, if you prefer:
`POST https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/pages/projects/almamesh/domains`
with body `{"name":"almamesh.com"}` and a Pages:Edit token.)

---

## 🎟️ Step 3 — Create a scoped Cloudflare API token

Used by CI to deploy. Make it **least-privilege**.

> Cloudflare dashboard → **My Profile** → **API Tokens** → **Create Token** →
> **Create Custom Token**:
> - **Permissions:** `Account` → `Cloudflare Pages` → **Edit**
> - **Account Resources:** Include → *your account*
> - (Zone permissions are not required for `pages deploy`.)
> - Create, then **copy the token value** (shown once) → this is `CLOUDFLARE_API_TOKEN`.

---

## 🔐 Step 4 — Add the four GitHub repo secrets

The deploy workflow needs exactly these four. The `--body "$(...)"` form strips any
trailing newline (important — the workflow decodes with `base64 -d`).

```bash
cd /path/to/almamesh

gh secret set CLOUDFLARE_API_TOKEN    --body "<the token from Step 3>"
gh secret set CLOUDFLARE_ACCOUNT_ID   --body "<Account ID from wrangler whoami>"
gh secret set BUNDLE_PRIVATE_KEY_B64  --body "$(base64 < backend/keys-prod/private.key)"
gh secret set BUNDLE_PUBLIC_KEY_B64   --body "$(base64 < backend/keys-prod/public.key)"

# Verify all four exist (values are never shown):
gh secret list
```

The moment all four exist, the preflight gate flips from **skip** to **deploy**.

---

## 🚀 Step 5 — First deploy (manual, watched)

Don't wait for the next merge — trigger it once by hand and watch it.

```bash
# Trigger the deploy workflow manually (uses the latest git tag as the bundle label):
gh workflow run "Deploy almamesh.com"

# Watch it run:
gh run watch "$(gh run list --workflow='Deploy almamesh.com' --limit 1 --json databaseId -q '.[0].databaseId')"
```

What the run does (see `deploy.yml` + `build-prod.sh`): installs deps, fetches the
Pyodide dist, restores the prod keypair from the secrets, **signs** the bundle into
`backend/origin-prod/`, bakes it into `dist/bundle/` + `dist/public.key`, builds the
PWA, deploys `dist/` to Cloudflare Pages, then **shreds** the restored private key.

---

## ✅ Step 6 — Verify the live site (static PWA, not a server)

There is no `/health` endpoint — health is "the app boots and draws a chart
offline". Check, in a browser, at https://almamesh.com :

- [ ] App shell loads over HTTPS; no console errors.
- [ ] **Onboard for real** (name + birth date/time + city) → **Generate** → wait for
      the ~38 MB engine bootstrap → a chart renders on `/dashboard`.
- [ ] **Zero cross-origin on chart draw** — open DevTools → Network, draw a chart:
      the only requests are same-origin (`/bundle/*`, `/pyodide/*`, app assets). The
      only allowed outbound is an AI call *you* opt into.
- [ ] **Offline reload** — turn off network, reload: the app still works (SW + OPFS).
- [ ] The signed bundle resolves: `/bundle/latest` is served and the ed25519
      signature verifies against `/public.key` (no signature error in console).
- [ ] **Download PDF** from `/report` produces the beautiful report (correct dates).

---

## 🔁 Step 7 — Confirm auto-deploy

After Steps 1–5, normal flow takes over: **merge a PR to `main` → "Test" passes →
`deploy.yml` auto-runs and ships almamesh.com.** Confirm once:

```bash
# After your next merge to main, a Deploy run should appear automatically:
gh run list --workflow="Deploy almamesh.com" --limit 3
```

---

## 🩹 Rollback

Bundles are content-addressed + versioned and Cloudflare Pages keeps every
deployment:

- **App rollback:** Cloudflare dashboard → Workers & Pages → almamesh →
  **Deployments** → pick a previous deployment → **Rollback**.
- **Bundle rollback:** re-run `build-prod.sh` with the prior `--version` label (or
  repoint `latest` to the previous manifest hash) and redeploy. Because chunks are
  content-addressed, a stale client re-fetch is byte-identical.

---

## Key custody rules (don't skip)

- The prod **private key is irreplaceable** — back it up off-machine (Step 1) and
  never commit it. `.gitignore` already excludes `backend/keys-prod/`,
  `backend/origin-prod/`, `frontend/apps/web/public/bundle/`, and
  `public/public.key`.
- Treat `BUNDLE_PRIVATE_KEY_B64` like the key itself — rotating it orphans clients.
- `OPENROUTER_API_KEY` is **client-side / BYO** — never bake it into the build or a
  Cloudflare env var. The static site ships zero server secrets.
- Use HTTPS only (required for service workers + OPFS) — Cloudflare provides it.

---

## Quick reference — the four secrets

| GitHub secret | Value | Source |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | Pages:Edit-scoped token | Step 3 |
| `CLOUDFLARE_ACCOUNT_ID` | account that owns the project + zone | `npx wrangler whoami` |
| `BUNDLE_PRIVATE_KEY_B64` | `base64 < backend/keys-prod/private.key` | Step 1 |
| `BUNDLE_PUBLIC_KEY_B64` | `base64 < backend/keys-prod/public.key` | Step 1 |
