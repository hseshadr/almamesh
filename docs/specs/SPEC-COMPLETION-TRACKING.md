# Spec Completion Tracking

**Last Updated:** 2026-01-23
**Architecture Reference:** Spec 046 (completed/ - Radical Simplification)

---

## Quick Reference

**Spec 046 (Radical Simplification)** completed the migration from 161K → ~6K LOC. Now serves as architectural reference in `completed/`. All decisions should follow its principles: minimal code, high cohesion, library-first.

**Current Focus:** Spec 061 (Backend Stability - P0 Critical), then Karma System (Specs 054-058)

---

## Folder Structure

```
docs/specs/
├── completed/           # Fully implemented specs
│   ├── 043-astronomical-computation-validation.md
│   ├── 044-security-hardening.md
│   ├── 046-radical-simplification.md    # Architectural reference
│   ├── 047-pydanticai-personalized-astrology.md
│   ├── 048-claude-artifacts-simplification.md
│   ├── 049-backend-functional-parity.md
│   ├── 050-composite-dasha-engine.md
│   ├── 051-user-model-memory.md
│   ├── 052-predictive-canonical-schema.md
│   └── 060-auth-migration-clerk-to-supabase.md
├── 054-karma-action-classification.md   # NEW - Draft
├── 055-karma-ledger-schema.md           # NEW - Draft
├── 056-karma-api-endpoints.md           # NEW - Draft
├── 057-karma-gamification-ui.md         # NEW - Draft
├── 058-dasha-modifier-config.md         # NEW - Draft
├── 061-backend-stability-fixes.md       # P0 Critical
├── SPEC-COMPLETION-TRACKING.md
└── SPEC-TEMPLATE.md
```

---

## Spec Format Convention

**All specs are flat files**: `NNN-name.md`

Follow `SPEC-TEMPLATE.md` for new specs. The template includes:
- Standard sections (Goal, Requirements, Technical Design, etc.)
- **Quality Validation** section with agent mapping (REQUIRED)
- Testing requirements and security checklists
- Pre-merge checklist

---

## Active Specs

| Spec | Title | Priority | Status | Notes |
|------|-------|----------|--------|-------|
| **054** | Karma Action Classification | P2 | Draft | LLM-based action classification via PydanticAI |
| **055** | Karma Ledger Schema | P2 | Draft | Database models, transaction log, daily summaries |
| **056** | Karma API Endpoints | P2 | Draft | REST endpoints for karma operations |
| **057** | Karma Gamification UI | P2 | Draft | React components: meter, opportunities, trends |
| **058** | Dasha Modifier YAML Config | P2 | Draft | External config for Dasha-specific multipliers |
| **061** | Backend Stability & API Contract Fixes | P0 | Draft | Blocking onboarding flow (500s, CORS, crashes) |

### Karma System Overview (Specs 054-058)

The **Karma Ledger & Reinforcement Engine (KLRE)** is a game-theoretic behavioral feedback system:

- **Core Concept**: Karma as a finite resource (0-120) that users burn through positive actions
- **Classification**: LLM analyzes user-reported actions for category, intent, and authenticity
- **Dasha-Conditioned**: Multipliers vary based on current planetary period
- **Anti-Gaming**: Diminishing returns, pattern detection, authenticity scoring
- **Frontend**: Visual karma meter, opportunity panel, transaction history

**Implementation Order:**
1. Spec 058 (Config) → Spec 054 (Classification) → Spec 055 (Schema) → Spec 056 (API) → Spec 057 (UI)

---

## Completed Specs

> **Location:** `docs/specs/completed/`

| Spec | Title | Completed | LOC / Result |
|------|-------|-----------|--------------|
| **043** | Astronomical Validation | 2026-01-20 | 20 validation tests, 234 total pass |
| **047** | PydanticAI + Agent Lightning | 2026-01-20 | Structured interpretation, personalization added |
| **052** | Predictive Canonical Schema | 2026-01-20 | Layer A/B/C pipeline done |
| **060** | Auth Migration (Clerk → Supabase) | 2026-01-22 | Supabase JWT, Google/Facebook OAuth |
| **044** | Security Hardening | 2026-01-19 | ~270 (security.py + rate_limiting.py) |
| **046** | Radical Simplification | 2026-01-17 | API split, routers/schemas extracted |
| **048** | Claude Artifacts Simplification | 2026-01-17 | N/A (docs only) |
| **049** | Backend Functional Parity | 2026-01-17 | ~400 (api.py additions) |
| **050** | Composite Dasha Engine | 2026-01-18 | 1,127 |
| **051** | User Model + Memory | 2026-01-19 | 617 |

---

## Deleted Specs (2026-01-17)

The following specs were deleted (preserved in git history). They were superseded by Spec 046 or no longer relevant:

- 008 - Assistant UI Chat
- 015 - PII Encryption/Masking
- 021 - Integration Tests
- 022 - Splash Landing Page
- 023 - Auth Migration (superseded by 060: Supabase Auth)
- 037 - Zero-Trust Cloudflare (superseded by 060: Supabase Auth)
- 038 - FAANG Code Quality
- 041 - Account Deletion Bug

---

## Execution Priority

### Current State
**Karma System (Specs 054-058)** - New feature development in progress.

### Active (in docs/specs/)
- 🔴 Spec 061 - Backend Stability & API Contract Fixes (P0 Critical)
- ⏳ Spec 054 - Karma Action Classification (Draft)
- ⏳ Spec 055 - Karma Ledger Schema (Draft)
- ⏳ Spec 056 - Karma API Endpoints (Draft)
- ⏳ Spec 057 - Karma Gamification UI (Draft)
- ⏳ Spec 058 - Dasha Modifier YAML Config (Draft)

### Completed (in completed/)
- ✅ Spec 043 - Astronomical Validation
- ✅ Spec 044 - Security Hardening
- ✅ Spec 046 - Radical Simplification (Architectural Reference)
- ✅ Spec 047 - PydanticAI Integration
- ✅ Spec 048 - Claude Artifacts Simplification
- ✅ Spec 049 - Backend Functional Parity
- ✅ Spec 050 - Composite Dasha Engine
- ✅ Spec 051 - User Model + Memory
- ✅ Spec 052 - Predictive Canonical Schema
- ✅ Spec 060 - Auth Migration (Clerk → Supabase)

---

## Spec Dependency Graph

```
[completed/] Spec 046 (Architecture Foundation) ← REFERENCE GUIDE
    │
    ├── [completed/] Spec 043, 044, 047, 048, 049, 050, 051, 052
    │
    └── [active] Karma System (054-058)
            │
            ├── Spec 058 (Dasha Config) ← Start here
            │       └── YAML config for all 9 Dashas
            │
            ├── Spec 054 (Classification) ← Depends on 058, 047
            │       └── PydanticAI agent for action classification
            │
            ├── Spec 055 (Ledger Schema) ← Depends on 054
            │       └── SQLAlchemy models, CRUD operations
            │
            ├── Spec 056 (API Endpoints) ← Depends on 054, 055
            │       └── REST API for karma operations
            │
            └── Spec 057 (Gamification UI) ← Depends on 056
                    └── React components, Zustand store
```

### Quality Validation Agents

Each spec requires validation via Claude Code agents before merging:

| Spec | Required Agents |
|------|----------------|
| 054, 055, 056, 058 | `code-quality-backend`, `architecture-advisor` |
| 057 | `code-quality-frontend`, `architecture-advisor` |
| 058 | `docs-sync-agent` (for YAML documentation) |

---

## Governance Rules

### 1. Spec 046 Principles Apply
All new code should follow Spec 046's architectural principles:
- High cohesion, low coupling
- Library-first (don't reinvent)
- ~500 LOC per module max
- Simple async Python over complex orchestration

### 2. Complete Before Moving
Finish a spec entirely before starting another (unless blocked).

### 3. Priority Order
```
P0 CRITICAL → Must complete first
P1 HIGH     → After P0 done
P2 MEDIUM   → After P1 done
P3 LOW      → Backlog
```

### 4. Flat File Format
New specs: `NNN-title.md` (flat file)
Don't create directories unless spec has multiple supporting docs.

---

## Key Architecture Decisions (Spec 046 - Reference)

| Decision | Status |
|----------|--------|
| Simple async workflows | ✅ Direct async/await |
| No Hexagonal Architecture | ✅ Direct imports |
| No Event Bus | ✅ Direct function calls |
| 11 Backend Modules | ✅ api, database, calculations, llm, auth, config, dasha_engine, user_model, rate_limiting, predictive, security |
| ~5,100 Backend LOC | ✅ Core modules only |
| Library-First | ✅ PydanticAI, FastAPI, Pydantic, SQLAlchemy |

**Note:** The `yogas/` directory (~3,600 LOC) exists but is **dead code** - never called from active code paths. Yoga detection uses the simplified `detect_yogas()` function in `calculations.py` (lines 616-673). The `yogas/` module is a deletion candidate per cleanup priorities.

**Dasha Engine:** New module (1,127 LOC) implementing Spec 050
- Composite Vimshottari + Chara + Yogini timeline
- Jaimini Karakas calculation
- Confluence scoring for event prediction
- API endpoint: POST /api/v1/charts/{chart_id}/composite-dasha

**User Model:** New module (~600 LOC) implementing Spec 051
- Life context models (Career, Relationship, Location, Health, Financial)
- Context modifiers that personalize engine predictions
- 3 DB models (UserModelDB, EpisodicMemoryDB, PredictionFeedbackDB)
- 6 API endpoints for model CRUD and feedback collection
- Stub classes for future vector DB integration

**Rate Limiting:** New module (~70 LOC) implementing Spec 044 Section 3.3
- Per-user and per-IP rate limiting via slowapi
- Endpoint-specific limits (charts: 10/min, auth: 10/min, default: 100/min)
- Applied to /api/v1/charts/generate, /api/v1/charts/two-flow/generate, /api/v1/users/auth endpoints
- 10 tests

**Security Module:** New module (~200 LOC) implementing Spec 044
- CORS origin validation (blocks wildcard in production)
- SecurityHeadersMiddleware (X-Frame-Options, CSP, HSTS, etc.)
- RequestSizeLimitMiddleware (1MB default, configurable)
- Secrets validation on startup (production safety)
- 23 tests

**Predictive Schema:** Module (~350 LOC) implementing Spec 052 Phases 1-2
- Pydantic models for Predictive Canonical output
- Evidence, TimeWindow, PredictiveClaim, DomainForecast models
- PredictiveCanonicalValidator with referential integrity checks
- is_super_predictive() quality gate
- JSON Schema for LLM output validation
- 19 tests

**Rule Catalog:** New module (~150 LOC + YAML) implementing Spec 052 Phase 2
- AstrologicalRule and RuleCatalog Pydantic models
- YAML-based rule definitions (career_rules.yaml, relationship_rules.yaml)
- 12 career rules, 12 relationship rules with classical sources
- Lookup: find_by_id(), find_by_pattern(), find_by_tags(), find_by_category()
- LRU cached loading with clear_cache() for testing
- 23 tests

**PydanticAI Integration:** Updated llm.py (~450 LOC) implementing Spec 047 Phase 1
- Migrated from LiteLLM to PydanticAI for type-safe LLM outputs
- Structured output models: ChartInterpretation, QuestionAnswer, PlanetaryInsight, DashaPrediction
- Lazy agent initialization (no API keys required at import time)
- Multi-provider support (OpenAI, Anthropic)
- Backward-compatible streaming text output
- New structured output functions: generate_structured_interpretation(), answer_question_structured()
- 9 tests

---

## Karma System Architecture (Specs 054-058)

### Overview

The Karma Ledger & Reinforcement Engine (KLRE) is a quantitative, stateful, astrology-conditioned behavioral feedback system.

### Core Concepts

| Concept | Description |
|---------|-------------|
| **Karma Balance** | 0-120 resource that users "burn" through positive actions |
| **Transaction** | Immutable record of each karma change (audit trail) |
| **Classification** | LLM-based analysis of user-reported actions |
| **Authenticity** | Detection of performative vs genuine actions |
| **Dasha Modifiers** | Planet-specific multipliers (Saturn rewards responsibility, etc.) |
| **Anti-Gaming** | Diminishing returns, pattern detection, cooldowns |

### Data Flow

```
User Message → LLM Classification → Dasha Multipliers → Anti-Gaming → Transaction → Ledger Update
                    │                      │                  │
                    ↓                      ↓                  ↓
            ActionClassification    YAML Config        Pattern Detection
            {category, delta,       {multipliers,      {diminishing,
             authenticity}           opportunities}     flags}
```

### Files to Create

```
backend/src/almamesh/karma/
├── __init__.py
├── models.py           # SQLAlchemy: KarmaLedger, KarmaTransaction, KarmaDailySummary
├── schemas.py          # Pydantic: ActionClassification, responses
├── classification.py   # PydanticAI agent for LLM classification
├── crud.py             # Database operations
├── anti_gaming.py      # Diminishing returns, pattern detection
├── config/
│   ├── dasha_modifiers.yaml
│   └── schema.json
└── config_loader.py    # YAML loading and validation

frontend/apps/web/src/
├── components/karma/
│   ├── KarmaMeter.tsx
│   ├── OpportunityPanel.tsx
│   ├── KarmaInput.tsx
│   ├── TransactionFeed.tsx
│   ├── StreakDisplay.tsx
│   ├── TrendChart.tsx
│   └── KarmaDashboard.tsx
└── stores/
    └── karmaStore.ts
```

### Estimated LOC

| Component | Estimated LOC |
|-----------|---------------|
| Backend (karma/) | ~1,200 |
| Frontend (karma components) | ~800 |
| YAML Config | ~500 |
| Tests | ~400 |
| **Total** | **~2,900** |

---

## Reference Docs

- **Tech Stack**: `docs/tech-stack.md`
- **Code Guidelines**: `docs/code-guidelines.md`
- **CLAUDE.md**: Project context for AI assistants
