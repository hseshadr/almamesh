# Conversational rectification elicitation + approximate-date engine support — design spec

**Status:** approved design (2026-06-28). Phase 3 of rectification-as-authority.
Builds directly on Spec 059 (event-based rectification, shipped 2026-06-27, PR #1).
**Priority:** P1 HIGH (rectification is THE accuracy gate; the manual event form is the friction point).
**Dependencies:** Spec 059 (`/rectify` wizard, `RectificationEventInput`, `structureLifeEvents`,
`RECTIFICATION_FENCE`, the cusp/window engine + honest-band scorer, the birth-info-changed→regenerate
pipeline).

## TL;DR

Turn the cold "fill in date/category rows" rectification step into a **warm, guided LLM interview**
that draws out a user's life events, **nudges for specificity**, and prepopulates **reviewable** event
rows — and extend the engine to handle **half-remembered dates honestly** instead of forcing false
precision. Two invariants are sacred and unchanged from 059:

1. **Determinism fence** — the LLM only *structures* free text into typed
   `{date, precision, category, note?}`. The **engine** does 100% of the astrology and weighting.
2. **Honesty** — a vague memory yields a *weaker signal by construction* (never a hand-tuned fudge,
   never false precision); the existing margin→band, de-correlation cap, `MIN_DISCRIMINATING_EVENTS`
   gate, and "no headline %" all continue to hold.

Rectification becomes a **living** surface: it is easy to start during onboarding **and** easy to come
back to and update when the user later remembers an important event — a one-tap path that re-runs the
fit and refreshes the rectified-time authority.

## Context & trigger

Spec 059 shipped the `/rectify` wizard: the user enters dated, categorized life events; the Python
engine scores candidate rising signs against ascendant-dependent signals (dasha-lord ↔ house-lordship
match + transit-to-house at the event date); the result is an honest qualitative ranking with per-event
evidence and a margin — never a percentage; the human confirms and the chosen time becomes the working
authority. Two real-world friction points remain:

- **The event form is cold and high-effort.** A grid of empty date/category rows is intimidating and
  gives no help recalling or dating events. The existing `StoryAccelerator` ("Paste Your Story") softens
  this with one-shot paste→extract, but it does not *converse*: it cannot nudge, disambiguate, or coax
  out the events a user forgot. (~60% of the conversational idea already exists; the dialogue is missing.)
- **Half-remembered dates have nowhere to go.** The engine requires an exact date. A user who only knows
  "sometime around 2005" must either invent a precise date (false precision — the exact scam pattern the
  product refuses) or drop a genuinely useful event. The honest answer is to let the engine treat a vague
  date as the weaker, fuzzier signal it actually is.

## Goals

- Make starting **and updating** rectification feel effortless and humane — a guided interview, not a form.
- Raise the **count and date-precision** of discriminating events (exactly what the engine's
  `MIN_DISCRIMINATING_EVENTS=3` gate and de-correlation reward), without ever pressuring false precision.
- Let the engine accept **approximate dates** and weight them **honestly and deterministically**.
- Keep rectification a **living, one-tap-reachable** surface post-onboarding.

## Non-goals / Out of scope

- No change to the core ranking signals (dasha-lordship + transit) or the honest-band math beyond adding
  precision-aware weighting. No new astrology.
- No headline confidence %, ever. No "the AI found your time" framing — the LLM never fits or ranks.
- No local-only gate on the interview. It rides the **existing** PII-scrub→configured-endpoint pipeline,
  exactly like interpretation and chat (usually remote OpenRouter). See "Privacy posture".
- No separate event "span" field in the contract (YAGNI) — `approx` uses a fixed marginalization window.

---

## Requirements

### Must have
- A multi-turn **guided interview** that elicits life events conversationally, nudges for specificity,
  disambiguates ordering, suggests categories, and accepts "I don't remember exactly" gracefully.
- The interview **augments** the manual form: it emits typed events as **reviewable draft rows** in the
  existing `EventEntryStep`; the user edits/confirms before the engine fit. (Decided: augment, not replace.)
- A `precision` dimension on every event: `exact | month | year | approx`, defaulting to `exact`
  (back-compat), captured by the interview and editable in the form.
- Engine **precision-aware hybrid** weighting (Approach C): dasha-lordship full strength down to
  year-precision; transit signal window-marginalized over the precision window and **zeroed for `approx`**.
- **Living rectification:** the interview + event list are reachable and re-runnable post-onboarding from
  the dashboard and ProfileSettings; events persist and accumulate per-profile; re-running routes through
  the existing birth-info-changed→regenerate pipeline so the rectified time updates as the authority.
- Graceful degradation: no LLM configured → the manual form alone still works (no dead-end).
- Determinism + byte-parity preserved; golden fixtures use **synthetic natives only** (no real birth data).
- 3-way (en/es/pt) parity for all new copy.

### Should have
- The interview can be re-opened to add "one more thing I remembered" without re-doing prior events.
- Honest framing surfaced in the chat itself: more/better events narrow the hypothesis; they are not a verdict.

---

## Technical Design

### 1. Data contract (the typed spine)

```python
# backend/src/almamesh/rectification/models.py  (mirrored in @almamesh/shared-types)
class EventDatePrecision(str, Enum):
    EXACT = "exact"   # known day
    MONTH = "month"   # known month, not day        -> representative date YYYY-MM-15
    YEAR  = "year"    # known year, not month        -> representative date YYYY-07-01
    APPROX = "approx" # no reliable year (~a span)   -> representative date = midpoint of a ±APPROX_WINDOW

class RectificationEventInput(BaseModel):       # EXTENDED (059 had date, category, note)
    date: date_                                  # representative ISO date (see above)
    precision: EventDatePrecision = EventDatePrecision.EXACT   # NEW; default keeps 059 fixtures valid
    category: LifeEventCategory
    note: str | None = None                      # stays on-device; never sent to engine
```

- TS mirror in `@almamesh/shared-types`: `EventDatePrecision` union + `precision` on
  `RectificationEventInput` and the store `LifeEvent`. `@almamesh/store` `lifeEvents` gains a persist
  migration stamping existing rows `'exact'`.
- The manual form sets `precision: 'exact'`; the interview/structurer sets the real precision and
  the representative `date`.

### 2. Engine: precision-aware hybrid (Approach C)

Per event, precision gates **which signals participate and how widely they are marginalized**. The two
signals have genuinely different date-sensitivity, so they are treated differently — this is honest by
construction, not a tuned weight.

| precision | dasha-lordship signal | transit-to-house signal |
|-----------|-----------------------|-------------------------|
| `exact`   | full, at the date | full, at the date |
| `month`   | full | window-marginalized over the ~30-day month |
| `year`    | full at the mahadasha level; finer dasha levels marginalized over the ~365-day year | window-marginalized over the ~365-day year (weak but non-zero) |
| `approx`  | marginalized at the mahadasha level over ±`APPROX_WINDOW` (default ±2 yr) | **zeroed** |

- **Window-marginalization** = evaluate the (ascendant-dependent) condition on a deterministic fixed
  grid across the window and use the supported fraction/strength for each candidate rising sign. A vague
  date thus contributes discriminating power *only* where a candidate is supported consistently across
  the window — imprecision naturally flattens the signal.
- Integrates unchanged with the existing **de-correlation cap**, **margin→band**, and
  **`MIN_DISCRIMINATING_EVENTS=3`** gate. A weak `approx` event (no transit, marginalized dasha) may
  simply not clear the "discriminating" bar — which is the honest outcome.
- **Determinism:** fixed sampling grid, pinned `reference_date`; Pyodide==CPython byte-parity holds. The
  exact grid resolution and which dasha levels participate per precision are finalized in the engine
  implementation plan and locked by golden fixtures (synthetic natives only).

### 3. Frontend: the conversational elicitor (*UX is the product*)

Evolve `StoryAccelerator` from one-shot paste into a multi-turn **guided interview**, reusing the
existing chat stack (`streamChartChat` transport, `ChatTurn` history, the `ChatPanel`/`useChatThread`
primitives, streaming). Behavior:

- Warm, brief open that acknowledges this can be hard and states the *why* in one honest line.
- Conversational asks; **nudges for specificity** ("Do you remember the season? the year?"),
  **disambiguates ordering** ("Was that before or after the move?"), **suggests a category**.
- Accepts "I don't remember exactly" without pressure → records the event with the right `precision`.
- Emits typed `{date, precision, category, note?}` (extended `structureLifeEvents`) → appends
  **reviewable draft rows** into `EventEntryStep`. The user edits/confirms before the fit.
- **Layout:** the interview is the inviting primary path at the top of the events step; the manual form
  sits directly below as the always-available fallback and the editor for the chat's drafts.

Great-UX bar (non-negotiable, this is the product's wedge): streaming typing feel; friendly en/es/pt
microcopy; mobile-first; accessible (ARIA, keyboard, focus order); the dark-input contrast already
shipped; an unmistakable "review these before continuing" affordance; never a dead-end.

### 4. Living rectification (onboarding AND ongoing updates)

- Rectification is not a one-shot onboarding step. The event list + interview are reachable post-onboarding
  from the **dashboard** (a clear "Remembered something? Refine your birth time" entry, alongside the
  existing cusp callout) and **ProfileSettings**.
- Events **persist and accumulate per-profile** (`lifeEvents` store). Re-opening the interview adds to the
  existing set ("one more thing I remembered"); prior events are preserved.
- Re-running the fit routes through the **existing birth-info-changed→regenerate pipeline** (059): the
  rectified time updates as the working authority, both times stay shown, the honest band re-computes. No
  data loss, no re-onboarding.

### 5. Privacy posture (reuse, don't reinvent)

- The interview rides the **existing** pipeline: PII-scrubbed text → the configured endpoint (usually
  remote OpenRouter), identical to interpretation and chat. No local-only gate. (Settled: the privacy
  model is already established; do not manufacture a new gate.)
- `RECTIFICATION_FENCE` is extended for an **interview persona**: the LLM may converse and structure, but
  must never fit/rank/declare a time or invent dates; output is hard-validated to typed events and PII is
  dropped at the validator exactly as today (the typed `{date, precision, category}` output is the
  privacy boundary). Reuse the chat's egress-consent pattern. The engine stays zero-egress.

---

## Files to Create/Modify

| File | Changes |
|------|---------|
| `backend/src/almamesh/rectification/models.py` | Add `EventDatePrecision`; add `precision` to `RectificationEventInput` |
| `backend/src/almamesh/rectification/scorer.py` | Precision-aware hybrid weighting + deterministic window-marginalization |
| `backend/src/almamesh/rectification/candidates.py` (as needed) | Representative-date handling for non-exact precision |
| `backend/tests/rectification/` | Precision-weighting unit tests + golden fixtures (synthetic natives) |
| `frontend/packages/shared-types/src/index.ts` | `EventDatePrecision` union + `precision` on event types |
| `frontend/packages/store/src/lifeEvents.ts` | `precision` field + persist migration (existing → `exact`) |
| `frontend/packages/llm/src/structure-life-events.ts` | Emit/validate `precision`; interview persona |
| `frontend/packages/llm/src/prompt.ts` | Extend `RECTIFICATION_FENCE` for the interview persona |
| `frontend/packages/llm/src/` (new) | `streamRectificationInterview` (multi-turn elicitor) on existing transport |
| `frontend/apps/web/src/components/features/rectify/StoryAccelerator.tsx` | Evolve paste → guided interview UI |
| `frontend/apps/web/src/components/features/rectify/EventRow.tsx` | Precision indicator/editor on rows |
| `frontend/apps/web/src/pages/Dashboard.tsx` / `IdentityStrip.tsx` | "Remembered something?" living-rectification entry |
| `frontend/apps/web/src/locales/{en,es,pt}/rectify.json` | All new interview + precision copy (3-way parity) |

---

## Implementation Phases

### Phase 1 — Engine precision contract + weighting (the typed spine)
- Add `EventDatePrecision` + `precision` (Python + shared-types mirror), default `exact`.
- Implement Approach C in the scorer with deterministic window-marginalization.
- Unit + golden fixtures (synthetic natives); Pyodide==CPython parity gate over the extended contract.
- Test: `cd backend && uv run pytest -q`; `cd frontend/packages/browser && bun run test:parity`.

### Phase 2 — Store + structurer
- `lifeEvents` precision field + persist migration; extend `structureLifeEvents` to emit/validate precision.
- Extend `RECTIFICATION_FENCE` for the interview persona.
- Test: `bun run --filter '*' typecheck`; Vitest for store migration + structurer.

### Phase 3 — Conversational interview UI + living-rectification entries
- `streamRectificationInterview` + evolve `StoryAccelerator` into the guided interview → reviewable rows.
- Precision indicator/editor on `EventRow`; dashboard/ProfileSettings "remembered something?" entries.
- 3-way i18n copy.

### Phase 4 — Live validation
- Build + preview; drive the **real** `/rectify` interview in Playwright Chromium: converse → draft rows
  → edit → fit → honest bands; verify living-update path (add an event later → regenerate). Clean console.

---

## Success Criteria

1. A user can complete rectification by **conversation alone**, ending in reviewed typed events that feed
   the deterministic engine — verified live on the built app, not just unit tests.
2. A half-remembered date ("around 2005") is accepted with `precision`, weighted honestly by the engine,
   and never coerced into false precision.
3. The engine remains **byte-identical** CPython↔Pyodide on the extended contract (parity gate green);
   059's existing fixtures still pass (default `exact` back-compat).
4. Rectification is updatable post-onboarding in **one tap** from the dashboard/profile, and re-running
   refreshes the rectified-time authority via the existing regenerate pipeline.
5. The LLM never fits, ranks, or declares a time; no headline % appears anywhere; PII is dropped at the
   typed-output boundary.
6. All quality gates green: backend pytest/ruff/mypy, frontend typecheck/lint/Vitest, parity, i18n parity.

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Window-marginalization adds non-determinism | Fixed sampling grid + pinned `reference_date`; lock with golden fixtures + parity gate |
| Interview elicits richer PII to a remote endpoint | Reuse the established scrub→endpoint pipeline + the typed-output fence (PII dropped at validator); same posture as chat/interpretation |
| LLM drifts toward "predicting" or naming a time | Interview-persona `RECTIFICATION_FENCE`; hard output validation; engine alone fits |
| Precision back-compat breaks 059 fixtures | `precision` defaults to `exact`; run 059's existing golden fixtures unchanged in CI |
| Agent leaks real birth data into new fixtures | Synthetic natives only; grep every diff for PII before commit (standing rule) |
| Chat feels gimmicky, hurts UX | Great-UX bar is a gate; live-drive the real flow; manual form always available as fallback |

---

## Quality Validation

- **Backend (`code-quality-backend`):** `ruff format --check`, `ruff check`, `mypy`, `pytest` on
  `backend/src/almamesh/rectification/`; new golden fixtures (synthetic) + Pyodide==CPython parity.
- **Frontend (`code-quality-frontend`):** `bun run --filter '*' typecheck`, lint, Vitest (store migration,
  structurer precision, interview component); i18n 3-way parity gate.
- **Live exit gate:** drive the real `/rectify` interview end-to-end on the built+previewed app
  (hooked gate necessary, not sufficient — exercise the real onboarding + the living-update path).
- **Security/PII:** no real birth data in fixtures; the typed `{date, precision, category}` output is the
  privacy boundary; engine stays zero-egress.

## References

- Spec 059 — event-based birth-time rectification (the foundation this extends).
- CLAUDE.md — "Rectification layer", determinism + byte-parity rules, the anti-scam honesty principles.
- Memory: rectification-as-authority; LLM-privacy-model-already-established; PII-sweep-agent-output.
