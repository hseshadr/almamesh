# Anonymous feedback — setup runbook

**TL;DR.** AlmaMesh is local-first and zero-egress. The feedback feature is the
**one deliberate, isolated, non-personal server touchpoint**: an anonymous
"is this valuable?" up/down signal plus an optional free-text "what's missing?".
It stores **no identity, no IP, no user-agent, no cookies** — only `created_at`,
the page slug, the sentiment, the optional message, and a coarse app version.

The code is a single Cloudflare **Pages Function** at
`frontend/apps/web/functions/api/feedback.ts`. When you deploy with
`bunx wrangler pages deploy dist --project-name=almamesh` (run from
`frontend/apps/web`), Wrangler auto-compiles the sibling `functions/` directory
into Pages Functions and mounts the handler at **`POST /api/feedback`**. No extra
build wiring is required.

What you have to do once (these need the **owner's** Cloudflare account — the
Pages-scoped deploy token cannot create D1 databases, dashboard bindings, or
Turnstile widgets):

1. Create the D1 database.
2. Apply the schema.
3. Bind the database to the Pages project as `DB`.
4. Create a Turnstile widget and set the `TURNSTILE_SECRET` Pages secret.
5. (Optional) Run it locally.

---

## API contract (must match the frontend widget exactly)

```
POST /api/feedback
Content-Type: application/json

{
  "page": "/dashboard",            // required, non-empty, <= 64 chars
  "sentiment": "up" | "down" | null,
  "message": "optional free text", // optional, trimmed, <= 2000 chars
  "turnstileToken": "<token>"      // from the Turnstile widget
}
```

Optional: `X-App-Version` request header (or `appVersion` in the body) records a
coarse build version. The handler stores nothing else from the request.

Responses:

| Status | Body | When |
|--------|------|------|
| `200` | `{ "ok": true }` | recorded |
| `400` | `{ "ok": false, "error": "<reason>" }` | invalid input (bad/empty page, oversized message, invalid sentiment, malformed JSON, or nothing to record — neither a sentiment nor a message) |
| `403` | `{ "ok": false, "error": "turnstile" }` | Turnstile verification failed (or the token was missing while the secret is configured) |
| `500` | `{ "ok": false, "error": "storage_unavailable" \| "storage_error" }` | the `DB` binding is missing/misconfigured, or the insert failed (see step 3) |

Same origin, so no CORS is needed.

---

## 1. Create the D1 database

```bash
cd frontend/apps/web
bunx wrangler d1 create almamesh-feedback
```

Copy the printed **`database_id`** (you'll need it for the dashboard binding in
step 3, and for the optional `[[d1_databases]]` block if you keep one in
`wrangler.toml`).

## 2. Apply the schema

```bash
cd frontend/apps/web
bunx wrangler d1 execute almamesh-feedback --remote --file=migrations/0001_feedback.sql
```

Schema (`migrations/0001_feedback.sql`):

```sql
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  page TEXT NOT NULL,
  sentiment TEXT,        -- 'up' | 'down' | NULL
  message TEXT,          -- nullable free text
  app_version TEXT
);
CREATE INDEX IF NOT EXISTS idx_feedback_page ON feedback(page);
```

## 3. Bind the database to the Pages project as `DB`

Cloudflare dashboard → **Pages** → project **`almamesh`** → **Settings** →
**Functions** → **D1 database bindings** → **Add binding**:

- **Variable name:** `DB`  (must be exactly `DB` — the handler reads `env.DB`)
- **D1 database:** `almamesh-feedback`
- Add it for **Production** (and **Preview** too if you want preview deploys to
  collect feedback).

The handler returns a clean `500 {ok:false,error:"storage_unavailable"}` and logs
`[feedback] D1 binding "DB" is not configured` if this binding is absent — so a
missing binding shows up as a clear, logged error rather than a confusing crash.

## 4. Turnstile (abuse defense)

Turnstile is the **primary** abuse defense for this endpoint.

1. Dashboard → **Turnstile** → **Add widget** → hostname `almamesh.com`
   (add `localhost` too if you want to test the real widget locally).
2. Copy the **Site Key** (public) and the **Secret Key** (private).
3. Dashboard → **Pages** → `almamesh` → **Settings** → **Environment variables
   and secrets** → add a **secret** named **`TURNSTILE_SECRET`** = the Secret
   Key, for **Production** (and Preview if desired).

The **Site Key** is public and is consumed at **build time** by the frontend as
`VITE_TURNSTILE_SITE_KEY` (the frontend widget agent wires the client side). It
must be available to the production build — either:

- a **GitHub Actions repo variable** `VITE_TURNSTILE_SITE_KEY` passed through to
  the `bun run build` step, or
- hardcoded in the build config (acceptable, since the site key is **public** by
  design).

**Graceful dev fallback:** if `TURNSTILE_SECRET` is **not** set (local dev), the
handler **skips** Turnstile verification so you aren't blocked. It is **never**
skipped when the secret is present.

## 5. Run it locally

The handler skips Turnstile when `TURNSTILE_SECRET` is unset, so locally you only
need a D1 binding. With a local (not `--remote`) D1 database:

```bash
cd frontend/apps/web
bun run build                                  # functions need a real build alongside dist/
bunx wrangler pages dev dist --d1 DB=almamesh-feedback
# then:
curl -i -X POST http://localhost:8788/api/feedback \
  -H 'content-type: application/json' \
  -d '{"page":"/dashboard","sentiment":"up","message":"local test","turnstileToken":"dev"}'
# -> HTTP/1.1 200 OK  {"ok":true}
```

Apply the schema to the **local** D1 instance once (omit `--remote`):

```bash
bunx wrangler d1 execute almamesh-feedback --local --file=migrations/0001_feedback.sql
```

To read back what was collected:

```bash
bunx wrangler d1 execute almamesh-feedback --remote \
  --command "SELECT created_at, page, sentiment, message, app_version FROM feedback ORDER BY id DESC LIMIT 50;"
```

---

## Running the handler's unit tests

The handler is covered by `functions/api/__tests__/feedback.test.ts` (Vitest,
14 cases: valid insert, dev fallback, Turnstile pass/fail/missing-token, the
400 validation matrix, the "nothing to record" guard, the missing-`DB` 500, the
`X-App-Version` path, and a privacy assertion that no IP/UA is bound).

These tests live **outside `src/`**, so the app's default `vitest run`
(`test:unit`, whose `include` is `src/**`) does **not** pick them up. Run them
with a one-off node-environment config:

```bash
cd frontend/apps/web
cat > .tmp-functions.vitest.config.mts <<'EOF'
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { globals: true, environment: 'node', include: ['functions/**/*.{test,spec}.ts'] },
});
EOF
bunx vitest run --config .tmp-functions.vitest.config.mts
rm -f .tmp-functions.vitest.config.mts
```

**Recommended follow-up (one line, owner's call):** add
`'functions/**/*.{test,spec}.ts'` to the `test.include` array in
`frontend/apps/web/vitest.config.ts` so these tests run as part of the standard
`bun run test:unit` / CI. (That file is owned elsewhere, so it is intentionally
left untouched here.)

Typecheck the function in isolation (uses `@cloudflare/workers-types`, kept out
of the React app build):

```bash
cd frontend/apps/web
bunx tsc -p functions/tsconfig.json --noEmit
```
