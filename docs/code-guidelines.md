# Code Guidelines - AlmaMesh

> Development standards for AlmaMesh — a **free, local-first, in-browser** Vedic
> astrology app. There is **no backend server, database, account, or HTTP API**.
> The Python `almamesh` package is the deterministic chart engine plus a
> build-time signed-bundle publisher; the browser app is the entire product
> surface. (Optional narration runs **in the browser** via `@almamesh/llm`, not
> in Python.)

---

## Core Principles

### 1. Library-First Development

**NEVER write custom code when battle-tested libraries exist.**

| Task | Use Library |
|------|-------------|
| Validation / typed boundaries | `pydantic` (Python), `zod` (TS) |
| State management | `zustand` |
| Date parsing | `python-dateutil`, `dayjs` |
| Astronomy (sidereal) | `skyfield` + DE421 ephemeris |
| In-browser engine | `pyodide` (WASM) in a Web Worker |
| Bundle signing | `cryptography` (ed25519) |
| PWA / service worker | `vite-plugin-pwa` |
| LLM (optional) | `@almamesh/llm` — no AI by default; opt-in cloud/BYO: any OpenAI-compatible endpoint (OpenRouter preset or a local Ollama), a save-time connectivity probe reports Connected or a specific error |

Only write custom code when:
- No suitable library exists (verify!)
- Library is unmaintained
- Library has security issues

### 2. Minimal Architecture

The Python package is the deterministic engine and the build-time bundle
publisher. No FastAPI, no auth, no database, no async server workflows.

```
backend/src/almamesh/
├── config.py          # Pydantic settings (deterministic-engine config)
├── calculations.py    # Sidereal astronomy (Skyfield + DE421 + Lahiri ayanamsa)
├── dasha/  yogas/      # Vimshottari dasha + yoga detection
├── schemas/           # Pydantic engine models (astrology.py)
└── edge/
    ├── chart_runtime.py  # Deterministic on-device chart runtime (also runs under Pyodide)
    ├── bundle.py         # Signed bundle publisher + consumer
    ├── cli.py            # almamesh-chart  (offline chart, no browser)
    └── publish_cli.py    # almamesh-bundle (keygen + sign + publish the bundle)
```

The same `calculate_sidereal_context(..., reference_date=...)` entrypoint runs on
CPython and under Pyodide, byte-identical. Pin `reference_date` in fixtures for
reproducibility.

### 3. Type Safety

**Backend (Python)**:
- All functions have type hints
- Use Pydantic models, not dicts
- Run `ruff check` and `mypy` before commits

**Frontend (TypeScript)**:
- Strict mode enabled
- No `any` types without justification
- Run `tsc` and `eslint` before commits

### 4. Model-Assisted Structuring Boundary

Model output is an untrusted draft, never canonical data. For free-form life events, the
required flow is:

`raw narrative → CanonicalLifeEventDraft → deterministic validation → user review/edit/confirm → canonical local record → purpose-specific projection`

- `CanonicalLifeEventDraft.summary` is potentially identifying and stays local/display-only.
- The rectification engine receives `RectificationEventInput` (`date`, `category`,
  `precision`) with the summary projected out. Chat/interpretation get separately defined
  minimum projections, never the draft object by convenience.
- Missing or invalid precision defaults conservatively to `approx`; no boundary may
  silently increase certainty.
- Extraction failure and a valid empty result are distinct. A manual path remains.
- Do not silently migrate legacy prose into canonical rows. Require review.

Current limitation: every onboarding entry path still needs the same explicit draft-confirm
gate before this pattern is fully complete product-wide.

### 5. Explainable Scores

Qualitative labels are derived presentation, not the score contract. Any user-facing score
must name the question it answers, scale, direction, baseline, components/weights,
thresholds, evidence coverage, missing-data behavior, and uncertainty. Keep raw fit score,
ranking margin, calibrated confidence, and probability distinct. If the evidence cannot
support a defensible number, render **inconclusive + why**.

Rectification exposes positive evidence, penalties, prior, total fit, ranking margin, and a
minimum-evidence-gated aggregate confidence. It must never describe that confidence as the
probability that a birth time is correct.

### 6. Generated Artifact Parity

PDFs are product interfaces. Their gate combines:

- a maximal canonical fixture with semantic sentinels for every section and final row;
- independent text extraction plus bounding-box assertions for page bounds, overflow,
  footer geometry, widow/orphan control, and heading+first-row cohesion;
- representative rendered-page visual review after template/font/renderer changes;
- production-equivalent renderer dependencies in CI; and
- a real browser download parsed for the same semantic sentinels.

Opening the file or checking its byte count is never sufficient.

---

## Development Commands

### Backend (engine + bundle publisher)
```bash
cd backend
uv sync --extra dev                                    # Install
uv run pytest -q                                       # Test (incl. DE421 golden parity)
uv run ruff format . && uv run ruff check --fix .      # Format + lint
uv run mypy src/                                       # Type check
uv run almamesh-chart "1990-01-15T12:00:00+00:00" 40.7128 -74.0060  # Offline chart, no browser
uv run almamesh-bundle keygen ./keys                   # Sign a bundle
```

### Frontend (Bun workspace monorepo)
```bash
cd frontend
bun install                                            # Install
bun run --filter '*' typecheck                         # Type check (all packages)
cd apps/web && bun run test:unit                       # Vitest unit tests
# Module Workers only resolve in a production BUILD, not `vite dev`:
cd apps/web && bun run build && bun run preview         # Run/verify the app end-to-end
cd apps/web && node scripts/verify-exit-gate.mjs        # Live-browser exit gate (headless Chromium)
```

---

## Testing

### Test Pyramid
- **70% Unit tests**: Fast, isolated (pytest, vitest)
- **20% Integration tests**: API contracts
- **10% E2E tests**: Critical user flows (Playwright)

### Minimal Test Strategy
```python
# Backend: deterministic engine — pin reference_date for reproducibility
def test_chart_generation_with_valid_data():
    """Chart generation returns the expected SiderealContext structure."""
    pass

def test_pyodide_matches_cpython_byte_for_byte():
    """Same inputs -> byte-identical chart on CPython and under Pyodide."""
    pass
```

```typescript
// Frontend: test critical user flows + the PII-redaction guard in @almamesh/llm
test('user can generate chart with valid birth data', async ({ page }) => {
  // ...
});
```

---

## Security Essentials

### PII Protection
- Sanitize user data before sending to LLM
- Don't log PII (names, emails, birth data)
- Use user IDs in logs, not personal info

```python
# BAD
logger.info(f"User {user.name} generated chart")

# GOOD
logger.info(f"User {user.id} generated chart")
```

### Secrets Management
- All secrets in environment variables
- No secrets in code or git
- `.env` files in `.gitignore`

---

## Code Quality Standards

### Python (Backend)
- **Formatting**: ruff format
- **Linting**: ruff check
- **Types**: mypy with strict mode
- **Tests**: pytest with ~70% coverage target

### TypeScript (Frontend)
- **Formatting + Linting**: Biome
- **Types**: tsc with strict mode (no `any`)
- **Tests**: Vitest (unit) + Playwright (live-browser exit gate)

### Function Size
- Target: 20-30 lines per function
- Maximum: 40 lines (with justification)
- Split large functions into smaller helpers

---

## Project Agents

Use these Claude agents for specialized tasks:

| Agent | Use For |
|-------|---------|
| `almamesh-backend` | Python engine + bundle publisher (sidereal calc, dasha, yogas, signed bundle CLI) |
| `almamesh-frontend` | React, Tailwind, Zustand, in-browser engine wiring |
| `testing` | Running tests (pytest, Vitest, Playwright exit gate) |
| `deployment` | CI/CD, bundle publishing |
| `code-quality-backend` | Python quality validation |
| `code-quality-frontend` | TypeScript quality validation |

---

## Quick Reference

### Before Committing
```bash
# Backend (engine must stay green, incl. DE421 golden parity)
cd backend && uv run ruff format --check . && uv run ruff check . && uv run mypy src/ && uv run pytest -q

# Frontend
cd frontend && bun run --filter '*' typecheck
cd frontend/apps/web && bun run test:unit
# Pyodide==CPython byte-parity gate (real browser; needs a build + preview
# running — see apps/web/scripts/verify-browser-parity.mjs header):
cd frontend/apps/web && node scripts/verify-browser-parity.mjs \
  http://localhost:4199 --reference-date=2025-01-01T00:00:00+00:00
```

### Key Files
- `CLAUDE.md` - Project overview, tool/agent dispatcher, the data contract
- `README.md`, `docs/tech-stack.md` - Source-of-truth local-first architecture
- `.claude/agents/` - Project-specific agents

---

## Anti-Patterns to Avoid

1. **Over-engineering**: No hexagonal architecture, no event buses, no complex abstractions
2. **Large functions**: Break down >40 line functions
3. **Duplicate code**: Extract shared logic
4. **Untyped code**: Always add type hints
5. **PII in logs**: Use IDs, not personal data
6. **Custom utilities**: Use libraries instead
