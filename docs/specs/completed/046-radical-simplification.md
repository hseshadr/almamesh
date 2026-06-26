# Feature Specification: Radical Simplification - Return to 5K Lines of Code

**Feature Branch**: `046-radical-simplification`
**Created**: 2026-01-13
**Status**: Draft
**Priority**: CRITICAL
**Overrides**: Specs 030 (Multi-Agent), 033 (Event-Driven), 034 (Four-Layer), 038 (FAANG Quality), 040 (Temporal Patterns)

> **Precedence Rule**: This spec OVERRIDES all architectural complexity introduced in previous specs. We are returning to first principles. See SPEC-COMPLETION-TRACKING.md for governance rules.

---

## 1. Summary

AlmaMesh has ballooned to 161,472 lines of Python code (104K source + 48K tests) for what is fundamentally: (1) Chart calculation, (2) LLM interpretation, (3) Simple API, (4) React UI, and (5) Core tests. **Target: 5,000-10,000 total lines of code.** This spec outlines the systematic deletion of over-engineering and return to product simplicity through lean packaging, high cohesion, and industry-strength libraries.

---

## 2. Requirements

### Must Have
- [ ] **Single calculation module** (`calculations.py`) - astronomy, dashas, yogas - **~1,500 lines**
- [ ] **Single API module** (`api.py`) - FastAPI routes, Pydantic models - **~800 lines**
- [ ] **Single LLM module** (`llm.py`) - LiteLLM integration, streaming - **~400 lines**
- [ ] **Simple database** (`database.py`) - SQLAlchemy models, basic CRUD - **~300 lines**
- [ ] **Config module** (`config.py`) - Pydantic settings - **~100 lines**
- [ ] **Utils module** (`utils.py`) - Date/geo helpers - **~100 lines**
- [ ] **Core tests** (`test_calculations.py`, `test_api.py`, `test_llm.py`) - **~1,000 lines**
- [ ] **React UI** - Simplified to essential flows - **~2,500 lines**
- [ ] **Total Backend: ~3,200 lines | Frontend: ~2,500 lines | Tests: ~1,000 lines = 6,700 lines**
- [ ] **Industry-strength libraries**: LiteLLM, FastAPI, Pydantic, SQLAlchemy, Redis
- [ ] **<20 dependencies** (down from 50+)
- [ ] **High cohesion modules** - Functions that change together, live together
- [ ] **Low coupling** - Modules don't depend on each other's internals

### Should Have (After Core Works)
- [ ] Birth time rectification (simple loop, not Temporal workflow)
- [ ] Chart caching (Redis - ~100 lines)
- [ ] Basic auth (OAuth - ~200 lines)

### Out of Scope (DELETE ENTIRELY)
- ❌ Hexagonal architecture (ports/adapters/infrastructure)
- ❌ Temporal workflows (use simple async functions for non-durable operations)
- ❌ Apache AGE graph database (not using relationships yet)
- ❌ Multi-layer abstractions (domain/infrastructure/adapters)
- ❌ 48K lines of tests (keep only critical path tests)
- ❌ Duplicate modules (astronomy.py vs domain/charts/astronomy.py)
- ❌ Over-engineered adapters (1,022-line user_adapter.py → ~100 lines)
- ❌ Custom LLM client (409 lines) when LiteLLM exists
- ❌ Custom validation when Pydantic handles it
- ❌ Custom date parsing when python-dateutil exists

---

## 3. Technical Design

### New Structure (Target)

```
backend/
├── vedic_core/
│   ├── __init__.py              # Package exports
│   ├── calculations.py          # 1,500 lines - Swiss Ephemeris, dashas, yogas
│   ├── api.py                   #   800 lines - FastAPI routes + Pydantic models
│   ├── llm.py                   #   400 lines - LiteLLM integration + streaming
│   ├── database.py              #   300 lines - SQLAlchemy models + CRUD
│   ├── config.py                #   100 lines - Settings (Pydantic BaseSettings)
│   └── utils.py                 #   100 lines - Helpers (dates, geo, etc.)
├── tests/
│   ├── test_calculations.py     #   500 lines - Astronomy accuracy tests
│   ├── test_api.py              #   300 lines - API integration tests
│   ├── test_llm.py              #   200 lines - LLM mocking tests
│   └── conftest.py              #   100 lines - Pytest fixtures
└── pyproject.toml

Total Backend: ~4,200 lines (backend + tests)
```

```
frontend/apps/web/
├── src/
│   ├── pages/               # 800 lines - Onboarding, Dashboard, Chat, Settings
│   ├── components/          # 1,200 lines - UI components
│   ├── lib/                 # 400 lines - API client, utils
│   └── main.tsx             # 100 lines - App entry + routing
└── package.json

Total Frontend: ~2,500 lines
```

**Grand Total: ~6,700 lines (down from 161,472 = 96% reduction)**

### Files to Modify
| File | Change |
|------|--------|
| `backend/vedic_core/_simplified/calculations.py` | **NEW** - Consolidate all astronomy calculations |
| `backend/vedic_core/_simplified/api.py` | **NEW** - All FastAPI routes + Pydantic models |
| `backend/vedic_core/_simplified/llm.py` | **NEW** - LiteLLM client + prompt templates |
| `backend/vedic_core/_simplified/database.py` | **NEW** - SQLAlchemy models + simple CRUD |
| `backend/vedic_core/_simplified/config.py` | **NEW** - Pydantic settings |
| `backend/vedic_core/_simplified/utils.py` | **NEW** - Date/geo utilities |
| `backend/pyproject.toml` | Update dependencies (12 prod + 4 dev = 16 total) |
| `docs/specs/SPEC-COMPLETION-TRACKING.md` | Add Spec 046 as P0 CRITICAL |

### New Files (Simplified Architecture)
| File | Purpose |
|------|---------|
| `backend/vedic_core/_simplified/` | Build new simplified modules here first |
| `backend/tests/test_calculations.py` | Astronomy accuracy tests (golden data) |
| `backend/tests/test_api.py` | API integration tests |
| `backend/tests/test_llm.py` | LLM mocking tests |

### Files/Folders to DELETE (After Cutover)
| Path | Reason | Lines Saved |
|------|--------|-------------|
| `backend/src/vedic_core/domain/` | Hexagonal over-engineering | ~15,000 |
| `backend/src/vedic_core/infrastructure/` | Abstraction overkill | ~25,000 |
| `backend/src/vedic_core/adapters/` | Ports & Adapters unnecessary | ~8,000 |
| `backend/src/vedic_core/workflows/` | Temporal for simple async | ~5,000 |
| `backend/src/vedic_core/activities/` | Temporal for simple async | ~3,000 |
| Duplicate astronomy modules | Keep one consolidated version | ~2,000 |
| `backend/src/vedic_core/interpretation/` | Merge into `llm.py` | ~2,000 |
| `backend/src/vedic_core/services/` | Business logic in `api.py` | ~8,000 |
| 40K lines of tests | Keep only critical paths | ~40,000 |

**Total Deleted: ~108,000 lines**

---

## 4. Implementation Checkpoints

**CRITICAL: Follow these checkpoints IN ORDER. Test after EACH checkpoint.**

| # | Checkpoint | Files Changed | Test Command | Pass Criteria |
|---|-----------|-------|------|---------------|
| 1 | Create `_simplified/calculations.py` | 1 new file | `pytest tests/test_calculations.py -xvs` | Matches existing output |
| 2 | Create `_simplified/llm.py` with LiteLLM | 1 new file | `pytest tests/test_llm.py -xvs` | Streams responses |
| 3 | Create `_simplified/database.py` | 1 new file | `pytest tests/test_database.py -xvs` | CRUD works |
| 4 | Create `_simplified/api.py` with `/charts/generate` | 1 new file | `curl http://localhost:8001/api/v2/charts/generate` | Returns chart |
| 5 | Add `/charts/interpret` endpoint | Modify `api.py` | E2E test | Streams interpretation |
| 6 | Add `/chat/ask` endpoint | Modify `api.py` | E2E test | Answers question |
| 7 | Golden test: Compare v1 vs v2 outputs | - | `pytest tests/test_golden.py` | Outputs match |
| 8 | Update dependencies in pyproject.toml | 1 file | `uv pip compile` | Resolves cleanly |
| 9 | Cutover: Move `_simplified/` → root | All files | `make test` | Tests pass |
| 10 | Delete old architecture folders | Delete ~90% | `make test` | Still passes |
| 11 | Frontend simplification | React files | `bun run test` | E2E works |
| 12 | Production smoke test | - | Manual | All flows work |

### Checkpoint Details

#### Checkpoint 1: Create Core Calculations Module
```
What to do:
- Extract from existing astronomy.py, lagna.py, dasha.py, yogas.py
- Consolidate into single calculations.py (~1,500 lines)
- Pure functions only (no HTTP, no DB, no LLM calls)
- Functions: calculate_lagna(), calculate_planetary_positions(), 
  calculate_dashas(), detect_yogas(), calculate_shadbala()

Test:
$ cd backend
$ pytest tests/test_calculations.py::test_lagna_accuracy -xvs
$ pytest tests/test_calculations.py::test_dasha_periods -xvs

Expected: 
- Lagna calculation matches a known reference chart
- Dasha periods match Swiss Ephemeris output
```

#### Checkpoint 2: Create LLM Integration Module
```
What to do:
- Install LiteLLM: uv add litellm instructor
- Create llm.py with generate_interpretation() and answer_question()
- Use LiteLLM for multi-provider support
- Streaming responses via async generator

Test:
$ cd backend
$ pytest tests/test_llm.py::test_interpretation_generation -xvs
$ pytest tests/test_llm.py::test_streaming_response -xvs

Expected:
- Mock LLM returns formatted interpretation
- Streaming yields multiple chunks
```

#### Checkpoint 3: Create Database Module
```
What to do:
- Create database.py with SQLAlchemy models
- Models: User, Chart, ChatMessage
- Simple CRUD functions: create_user(), get_chart(), save_chat_message()
- Async session management

Test:
$ cd backend
$ pytest tests/test_database.py::test_user_crud -xvs
$ pytest tests/test_database.py::test_chart_storage -xvs

Expected:
- User CRUD operations work
- Chart JSON serialization works
```

#### Checkpoint 4: Create API Module with Chart Generation
```
What to do:
- Create api.py with FastAPI app
- POST /api/v2/charts/generate endpoint
- Pydantic models: ChartGenerateRequest, ChartResponse
- Wire to calculations.py

Test:
$ cd backend
$ uvicorn vedic_core._simplified.api:app --reload &
$ curl -X POST http://localhost:8001/api/v2/charts/generate \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","datetime":"1990-01-01T12:00:00","latitude":12.9716,"longitude":77.5946}'

Expected:
- 200 OK response
- JSON chart data with lagna, planets, dashas
```

#### Checkpoint 5: Add Interpretation Endpoint
```
What to do:
- Add POST /api/v2/charts/interpret to api.py
- StreamingResponse with SSE
- Wire to llm.py generate_interpretation()

Test:
$ cd backend
$ curl -X POST http://localhost:8001/api/v2/charts/interpret \
  -H "Content-Type: application/json" \
  -d '{"chart_id":"123","mode":"layman"}' \
  --no-buffer

Expected:
- SSE stream with "data: " prefixed chunks
- Complete interpretation within 30 seconds
```

#### Checkpoint 6: Add Chat Q&A Endpoint
```
What to do:
- Add POST /api/v2/chat/ask to api.py
- StreamingResponse with SSE
- Wire to llm.py answer_question()

Test:
$ cd backend
$ curl -X POST http://localhost:8001/api/v2/chat/ask \
  -H "Content-Type: application/json" \
  -d '{"chart_id":"123","question":"What does my Venus placement mean?"}' \
  --no-buffer

Expected:
- SSE stream with contextual answer
- References chart data in response
```

#### Checkpoint 7: Golden Test - V1 vs V2 Output Comparison
```
What to do:
- Generate chart with old v1 API: POST /api/v1/charts/generate
- Generate same chart with new v2 API: POST /api/v2/charts/generate
- Compare lagna, planetary positions, dashas
- Tolerance: ±0.1° for positions, exact match for dashas

Test:
$ cd backend
$ pytest tests/test_golden.py::test_v1_v2_output_match -xvs

Expected:
- All planetary positions within 0.1° tolerance
- Dasha periods match exactly
- Sign placements match exactly
```

#### Checkpoint 8: Update Dependencies
```
What to do:
- Edit backend/pyproject.toml
- Remove: temporal-sdk, celery, neo4j, apache-age, factory-boy, pytest-mock
- Add: litellm, instructor
- Keep: fastapi, pydantic, sqlalchemy, redis, pyswisseph, skyfield
- Dev: pytest, ruff, mypy only

Test:
$ cd backend
$ uv pip compile pyproject.toml
$ uv pip install -e .

Expected:
- 12 production dependencies + 4 dev dependencies = 16 total
- Clean dependency resolution (no conflicts)
```

#### Checkpoint 9: Cutover to Simplified Architecture
```
What to do:
- Move backend/vedic_core/_simplified/* → backend/vedic_core/
- Update imports in tests
- Update api/main.py to import from new structure

Test:
$ cd backend
$ make test

Expected:
- All critical path tests pass
- <1,000 test lines total
- Build completes in <30 seconds
```

#### Checkpoint 10: Delete Old Architecture
```
What to do:
- rm -rf backend/src/vedic_core/domain/
- rm -rf backend/src/vedic_core/infrastructure/
- rm -rf backend/src/vedic_core/adapters/
- rm -rf backend/src/vedic_core/workflows/
- rm -rf backend/src/vedic_core/activities/
- rm -rf backend/src/vedic_core/interpretation/
- rm -rf backend/src/vedic_core/services/
- Delete 40K lines of over-engineered tests

Test:
$ cd backend
$ make test
$ make lint

Expected:
- Tests still pass with simplified architecture
- Ruff/mypy pass
- Total backend: ~3,200 lines (97% reduction)
```

#### Checkpoint 11: Frontend Simplification
```
What to do:
- Remove unused animation components
- Consolidate API client (packages/api-client/)
- Simplify Zustand stores
- Remove duplicate type definitions
- Target: 2,500 lines total

Test:
$ cd frontend
$ bun run typecheck
$ bun run test
$ bun run --filter @almamesh/web playwright test

Expected:
- TypeScript compiles cleanly
- E2E Playwright tests pass
- Bundle size <1MB (down from 2.6MB)
```

#### Checkpoint 12: Production Smoke Test
```
What to do:
- Deploy to staging environment
- Manual test: Chart generation flow
- Manual test: Interpretation streaming
- Manual test: Chat Q&A
- Manual test: 3D dasha visualization

Test:
- Navigate to https://staging.almamesh.com
- Complete onboarding with test birth data
- Verify chart displays correctly
- Ask 3 questions in chat, verify answers
- Check 3D dasha timeline animation

Expected:
- All user flows work end-to-end
- No JavaScript errors in console
- API response times <500ms p95
```

---

## 5. Testing Strategy

### Unit Tests (500 lines)
- [ ] `test_calculations.py::test_lagna_calculation_accuracy` - Verify against golden data
- [ ] `test_calculations.py::test_planetary_positions` - Swiss Ephemeris accuracy
- [ ] `test_calculations.py::test_dasha_periods` - Vimshottari dasha calculation
- [ ] `test_calculations.py::test_yoga_detection` - Gajakesari, Hamsa yogas
- [ ] `test_llm.py::test_interpretation_generation` - Mock LLM responses
- [ ] `test_llm.py::test_streaming_chunks` - Async generator yields
- [ ] `test_database.py::test_user_crud` - Create, read, update, delete
- [ ] `test_database.py::test_chart_json_storage` - JSON serialization

### Integration Tests (300 lines)
- [ ] `test_api.py::test_chart_generation_endpoint` - E2E chart generation
- [ ] `test_api.py::test_interpretation_streaming` - SSE streaming works
- [ ] `test_api.py::test_chat_ask_endpoint` - Q&A with context
- [ ] `test_golden.py::test_v1_v2_output_match` - Backward compatibility

### Manual Verification
- [ ] Deploy to staging environment
- [ ] Complete full onboarding flow (5 steps)
- [ ] Generate chart for 3 different birth dates
- [ ] Ask 10 questions in chat, verify quality
- [ ] Check 3D dasha visualization renders
- [ ] Test on mobile (iOS Safari, Android Chrome)
- [ ] Verify bundle size <1MB
- [ ] Check API response times <500ms p95

---

## 6. Rollback Plan

If issues arise after cutover:

1. **Immediate Rollback** (< 5 minutes):
   ```bash
   git revert HEAD
   git push origin main --force-with-lease
   ```

2. **API Rollback** (route to old endpoints):
   ```python
   # In api.py, add fallback
   @app.post("/api/v2/charts/generate")
   async def generate_chart_v2(req: ChartGenerateRequest):
       try:
           return await new_implementation(req)
       except Exception:
           logger.error("V2 failed, falling back to V1")
           return await old_implementation(req)
   ```

3. **Database Rollback**:
   - No schema changes, so no migration rollback needed
   - Chart data remains compatible

4. **Frontend Rollback**:
   ```bash
   cd frontend
   git checkout main~1
   bun install
   bun run build
   ```

5. **Restore Old Files** (if needed):
   - Old architecture exists in git history
   - `git checkout <commit-hash> -- backend/src/vedic_core/domain/`
   - Restore specific folders if functionality is missing

---

## 7. Definition of Done

- [ ] All 12 checkpoints completed and tested
- [ ] Backend reduced to ~3,200 lines (calculations, api, llm, database, config, utils)
- [ ] Frontend reduced to ~2,500 lines
- [ ] Tests reduced to ~1,000 lines (critical path only)
- [ ] **Total: 6,700 lines (97% reduction from 225K)**
- [ ] Dependencies reduced to <20 (12 production + 4 dev)
- [ ] All golden tests pass (v1 vs v2 outputs match)
- [ ] E2E Playwright tests pass
- [ ] Production smoke test successful
- [ ] User-facing flows work: Chart generation, interpretation, chat, 3D animations
- [ ] API response times <500ms p95
- [ ] Bundle size <1MB
- [ ] Code quality checks pass (ruff, mypy)
- [ ] Documentation updated (README, API docs)
- [ ] Team review and approval
- [ ] Deployed to production

---

## 8. Lean Packaging with Cohesion & Best Practices

### Core Principle: High Cohesion, Low Coupling

**Cohesion**: Each module does ONE thing well. Functions that change together, live together.

**Current Problem**: 
- `astronomy.py` (571 lines) AND `domain/charts/astronomy.py` (492 lines) - **ZERO cohesion**
- LLM code spread across `llm/`, `infrastructure/llm_client.py`, `adapters/llm/` - **Low cohesion**
- User logic in multiple adapters (1,022 lines) - **Scattered**

**Solution**: One concern = One file (until ~500 lines, then split by feature, not by layer)

### Package Structure: Cohesive Modules

```python
# calculations.py (1,500 lines) - ASTRONOMY: All ephemeris, lagna, dashas, yogas
"""
Swiss Ephemeris astronomical calculations.

COHESION: All astronomy-related calculations in one place.
COUPLING: Zero dependencies on database, API, or LLM.

Guidelines:
- Pure functions: Same input → Same output
- No HTTP calls, no database queries, no LLM calls
- Only math and Swiss Ephemeris
"""

def calculate_lagna(latitude: float, longitude: float, dt: datetime, 
                    ayanamsa: str = "LAHIRI") -> LagnaData:
    """Calculate lagna (ascendant) for given birth details."""
    # Implementation here
```

```python
# api.py (800 lines) - HTTP: All FastAPI routes + Pydantic models
"""
FastAPI routes for AlmaMesh.

COHESION: All HTTP concerns in one place (routes + request/response models).
COUPLING: Depends on calculations, llm, database (orchestrates them).

Guidelines:
- Thin controllers: Parse request → Call service → Return response
- No business logic (that belongs in calculations.py or llm.py)
- Pydantic models inline (no separate models/ folder until >500 lines)
"""

from vedic_core.calculations import calculate_lagna
from vedic_core.llm import generate_interpretation
from vedic_core.database import save_chart

@app.post("/api/v1/charts/generate")
async def generate_chart(req: ChartGenerateRequest) -> ChartResponse:
    lagna = calculate_lagna(req.latitude, req.longitude, req.datetime)
    chart = save_chart(user_id=get_current_user(), lagna=lagna)
    return ChartResponse(chart_id=chart.id, lagna=lagna)
```

```python
# llm.py (400 lines) - AI: All LLM integration (LiteLLM + prompts)
"""
LLM integration using LiteLLM.

COHESION: All AI/LLM concerns in one place.
COUPLING: Zero dependencies on database or API.

Guidelines:
- Prompt templates inline (or separate .txt if >100 lines)
- Streaming handled here
- Multi-provider fallback via LiteLLM config
"""

from litellm import acompletion

async def generate_interpretation(chart: ChartResponse, 
                                  mode: str = "layman") -> AsyncIterator[str]:
    """Generate streaming interpretation for a chart."""
    response = await acompletion(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        fallbacks=["claude-3-5-sonnet", "gemini-1.5-flash"],
        stream=True
    )
    async for chunk in response:
        yield chunk.choices[0].delta.content
```

```python
# database.py (300 lines) - PERSISTENCE: All SQLAlchemy models + CRUD
"""
SQLAlchemy models and CRUD operations.

COHESION: All database concerns in one place.
COUPLING: Zero dependencies on LLM or calculations.

Guidelines:
- Models + CRUD together (no separate "repositories")
- Simple functions: create_*, get_*, update_*, delete_*
"""

class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True)
    email = Column(String, unique=True)

async def create_user(session: AsyncSession, email: str, name: str) -> User:
    user = User(id=str(uuid4()), email=email, name=name)
    session.add(user)
    await session.commit()
    return user
```

### Dependency Flow (Clean Architecture Lite™)

```
┌─────────────────────────────────────────────────────┐
│                    api.py (HTTP)                    │
│  - Routes, Request/Response models                  │
│  - Orchestrates calls                               │
└────────────┬────────────────┬───────────────────────┘
             │                │
             ▼                ▼
    ┌────────────────┐  ┌─────────────┐
    │ calculations.py│  │   llm.py    │
    │ (Pure logic)   │  │ (AI calls)  │
    └────────────────┘  └─────────────┘
             │
             ▼
    ┌────────────────┐
    │  database.py   │
    │ (Persistence)  │
    └────────────────┘
```

**Rules**:
1. ✅ `api.py` can import from `calculations`, `llm`, `database`
2. ✅ `calculations.py` is pure (no imports from other modules)
3. ✅ `llm.py` doesn't import from `database` or `api`
4. ✅ `database.py` doesn't import from `calculations` or `llm`

### When to Split a Module

**Rule**: Only if a module hits **~500 lines** AND has clear sub-features, split by feature (not by layer).

**Example**: If `calculations.py` grows to 2,000 lines:
```
✅ calculations/
   ├── ephemeris.py     # Swiss Ephemeris wrapper
   ├── charts.py        # Lagna, houses
   ├── dashas.py        # Vimshottari dasha
   ├── yogas.py         # Yoga detection
   └── strength.py      # Shadbala
```

Each file is still **cohesive** (one astronomy feature per file).

---

## 9. Industry-Strength Libraries First (Never Reinvent)

### Core Principle: Use Battle-Tested Libraries

**Current Problem**: Custom code for things with excellent libraries:
- ❌ Custom LLM client (409 lines) when **LiteLLM** exists
- ❌ Custom streaming logic when **FastAPI** has SSE support
- ❌ Custom validation when **Pydantic** handles it

**Solution**: If a library has >5K GitHub stars and is actively maintained → **USE IT**.

### Library Selection Criteria

| Criteria | Threshold | Why |
|----------|-----------|-----|
| **GitHub Stars** | >5,000 | Community validation |
| **Last Commit** | <6 months | Actively maintained |
| **Downloads** | >1M/month | Battle-tested |
| **License** | MIT/Apache/BSD | Commercial-friendly |

### Recommended Stack (Industry Standard)

```toml
[project]
name = "vedic-core"
dependencies = [
    # Web Framework
    "fastapi>=0.104.0",              # Industry standard async API framework
    "uvicorn[standard]>=0.24.0",     # ASGI server
    
    # Data Validation
    "pydantic>=2.5.0",               # Best-in-class validation + serialization
    "pydantic-settings>=2.1.0",      # Environment variable management
    
    # Database
    "sqlalchemy[asyncio]>=2.0.0",    # ORM standard (async support)
    "asyncpg>=0.29.0",               # Fastest Postgres driver
    "alembic>=1.13.0",               # Database migrations
    
    # AI/LLM
    "litellm>=1.17.0",               # Multi-provider LLM (OpenAI/Claude/Gemini/Groq)
    "instructor>=0.4.0",             # Structured LLM outputs with Pydantic
    
    # Astronomy (Domain-Specific)
    "pyswisseph>=2.10.0",            # Swiss Ephemeris (gold standard)
    "skyfield>=1.47",                # Modern Python astronomy library
    
    # HTTP Client
    "httpx>=0.25.0",                 # Async HTTP client
    
    # Caching
    "redis[hiredis]>=5.0.0",         # Simple Redis client (Valkey compatible)
    
    # Utilities
    "python-dateutil>=2.8.0",        # Date parsing (don't write custom)
    "pytz>=2023.3",                  # Timezone handling
]

[project.optional-dependencies]
dev = [
    # Testing
    "pytest>=7.4.0",
    "pytest-asyncio>=0.21.0",
    
    # Code Quality
    "ruff>=0.1.0",                   # Linting + formatting (replaces 5 tools)
    "mypy>=1.7.0",                   # Type checking
]
```

**Total Dependencies**: 12 production + 4 dev = **16 total**
**Current Dependencies**: 50+ (too many!)

### Why Each Library Was Chosen

#### 1. **FastAPI** - Web Framework
```python
from fastapi import FastAPI
from fastapi.responses import StreamingResponse

app = FastAPI()

@app.post("/charts/interpret", response_class=StreamingResponse)
async def interpret_chart(chart: ChartData):
    async def generate():
        async for chunk in llm_interpret(chart):
            yield f"data: {chunk}\n\n"
    return StreamingResponse(generate(), media_type="text/event-stream")
```

**Why FastAPI**:
- ✅ Built-in async, SSE streaming, Pydantic integration
- ✅ 65K+ GitHub stars, used by Netflix/Microsoft/Uber
- **Replaces**: Custom routing, validation, streaming = **~500 lines saved**

#### 2. **LiteLLM** - Multi-Provider LLM
```python
from litellm import acompletion

async def call_llm(prompt: str) -> AsyncIterator[str]:
    response = await acompletion(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        fallbacks=["claude-3-5-sonnet", "gemini-1.5-flash"],
        stream=True
    )
    async for chunk in response:
        yield chunk.choices[0].delta.content
```

**Why LiteLLM**:
- ✅ Supports 100+ providers, automatic fallbacks, token counting
- ✅ 9K+ stars, actively maintained
- **Replaces**: Custom LLM client, fallback logic = **~800 lines saved**

#### 3. **Pydantic** - Data Validation
```python
from pydantic import BaseModel, Field

class BirthData(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
```

**Why Pydantic**:
- ✅ Automatic validation, JSON serialization, FastAPI integration
- ✅ 18K+ stars, industry standard
- **Replaces**: Manual validation, serialization = **~300 lines saved**

#### 4. **SQLAlchemy 2.0** - ORM
```python
from sqlalchemy.ext.asyncio import AsyncSession

async def get_chart(session: AsyncSession, chart_id: str) -> Chart | None:
    result = await session.execute(
        select(Chart).where(Chart.id == chart_id)
    )
    return result.scalar_one_or_none()
```

**Why SQLAlchemy**:
- ✅ Native async, type-safe queries, migration support
- ✅ 8K+ stars, industry standard
- **Replaces**: Custom query builders = **~500 lines saved**

### Libraries We DON'T Need (Current Bloat)

| Library | Current Use | Why Remove |
|---------|-------------|------------|
| **Temporal SDK** | Workflow orchestration | Overkill for simple async functions |
| **Apache AGE** | Graph database | No relationship features built yet |
| **Celery** | Task queue | FastAPI BackgroundTasks is enough |
| **pytest-mock** | Mocking | Built-in unittest.mock is fine |
| **factory-boy** | Test fixtures | Simple dicts are cleaner |

**Bloat Removed**: 7+ unnecessary dependencies

### Anti-Pattern: NIH (Not Invented Here) Syndrome

#### ❌ Don't Write Custom (Current: 409 lines)
```python
class CustomLLMClient:
    async def call_with_fallback(self, prompt: str):
        # ... 380 more lines of retry logic
```

#### ✅ Use Library Instead (New: 20 lines)
```python
from litellm import acompletion

async def call_llm(prompt: str):
    response = await acompletion(
        model="gpt-4o-mini",
        fallbacks=["claude-3-5-sonnet"],
        stream=True
    )
    async for chunk in response:
        yield chunk.choices[0].delta.content
```

**Result**: 20 lines vs 409 lines = **95% reduction**

---

## 10. Problem Statement & Justification

### Current State (BROKEN)
- **161,472 lines** of Python code (104K source + 48K tests)
- **30% is tests** (48K lines)
- **Duplication**: `astronomy.py` + `domain/charts/astronomy.py`
- **Over-abstraction**: 1,022-line user adapter, 976-line API router
- **Architectural confusion**: "Hexagonal" but layers mixed everywhere
- **Unused features**: Graph database for unbuilt features
- **User feedback**: "flow is broken - things are not rendering"

### What Users Actually Need
1. Chart generation (birth details → chart data)
2. LLM interpretation (chart → streaming explanation)
3. Chat Q&A (question + context → answer)
4. Birth time rectification (iterate charts)
5. Simple web UI (forms → API → display)
6. 3D animations (dasha timeline)

**That's it.** No distributed orchestration. No graph databases. No hexagonal architecture.

### Why This Is Not "Giving Up on Quality"

**Quality ≠ Lines of Code**

Current codebase has:
- ❌ 161K lines but **things are broken**
- ❌ 46% test coverage but **tests don't catch real bugs**
- ❌ "FAANG architecture" but **nobody can understand it**

A 6K line codebase can be:
- ✅ **Comprehensible** - One person can hold it in their head
- ✅ **Debuggable** - Simple stack traces
- ✅ **Maintainable** - No duplicate modules
- ✅ **Testable** - Test what matters
- ✅ **Fast** - No unnecessary abstractions

### Real-World Examples

| Product | LOC | What It Does |
|---------|-----|-------------|
| **Lobste.rs** | ~5,000 | Full Reddit clone |
| **Discourse** (early) | ~15,000 | Forum platform |
| **AlmaMesh** (should be) | ~6,000 | Chart calc + LLM + UI |

---

## 11. Migration Strategy & Timeline

### Phase 1: Parallel Build (Week 1)
Create `backend/vedic_core/_simplified/` alongside existing code:
- Build calculations.py, llm.py, api.py, database.py
- Test in isolation
- Compare outputs with existing v1 API

### Phase 2: Smoke Test (Week 2)
- New `/api/v2/` endpoints using simplified code
- Golden tests: v1 vs v2 outputs must match
- E2E testing: All user flows work

### Phase 3: Cutover (Week 3)
- Move `_simplified/` to root
- Delete old architecture (domain/, infrastructure/, adapters/)
- Update imports
- Run full test suite

### Phase 4: Frontend Simplification (Week 4)
- Remove unused components
- Consolidate API client
- Simplify state management
- Target: 2,500 lines

### Timeline Summary

| Week | Focus | Deliverable |
|------|-------|-------------|
| **1** | Build simplified backend | `_simplified/` modules working |
| **2** | Smoke test & validation | v2 matches v1 output |
| **3** | Cutover & delete old code | Production deployment |
| **4** | Frontend simplification | 2,500-line React app |

---

## 12. Success Metrics

| Metric | Current | Target | Reduction |
|--------|---------|--------|-----------|
| **Backend LOC** | 104,764 | 3,200 | **97%** |
| **Test LOC** | 48,664 | 1,000 | **98%** |
| **Frontend LOC** | 71,903 | 2,500 | **97%** |
| **Total LOC** | 225,331 | 6,700 | **97%** |
| **Dependencies** | 50+ | 16 | **68%** |
| **Build Time** | 3-5 min | 30 sec | **90%** |
| **Test Time** | 5-10 min | 30 sec | **95%** |
| **Files** | 927 | ~50 | **95%** |
| **API Response** | varies | <500ms p95 | - |
| **Bundle Size** | 2.6MB | <1MB | **62%** |

---

## 13. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Lose features users depend on | Medium | High | Golden tests: v1 vs v2 outputs must match |
| Break production | Low | Critical | Build in parallel, cutover only after validation |
| Regressions | Medium | High | Golden test suite with known charts |
| Team pushback | Low | Medium | Show working prototype first |
| Miss edge cases | Medium | Medium | Comprehensive golden test data (20+ charts) |

---

## 14. Appendix: What the Docs Say

From `docs/business/WHAT_IS_ALMAMESH.md`:
> "We're not building a horoscope app—we're building a universal framework"

**Reality Check**: We don't have relationships, social graphs, or multi-ontology support yet. We have:
1. Chart calculation
2. LLM interpretation  
3. Chat Q&A
4. Simple UI

Let's build those **excellently** in 6,000 lines before adding complexity.

---

## 15. References

- Current LOC count: 161,472 Python (104K source + 48K tests) + 71,903 TypeScript
- User feedback: "this is insane the number of lines of code for this relatively simple project"
- User expectation: "it should be like 5000 lines - it cannot be this hard"
- Actual product scope: Chart generation + LLM interpretation + Chat + UI
- Industry examples: Lobste.rs (~5K LOC), early Discourse (~15K LOC)

---

**Bottom Line**: We have 32x more code than needed for what we've actually built. This spec fixes that through radical simplification, lean packaging, high cohesion, and industry-strength libraries.
