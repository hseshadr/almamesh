# Spec 048: Claude Artifacts Simplification

**Status:** Complete
**Created:** 2026-01-17
**Related:** Spec 046 (Radical Simplification)

## Goal

Simplify CLAUDE.md and `.claude/agents/*` files to match the fresh, minimal AlmaMesh codebase (~1,800 LOC) instead of the complex legacy esoteric project (161K LOC).

## Current State

- **Codebase**: Fresh minimal rewrite with 6 core modules
- **Backend structure**: `backend/src/almamesh/` (auth, config, database, llm, calculations, api, workflows)
- **Frontend**: Copied from esoteric, standard React/Vite/Tailwind
- **Docs**: Source of truth in `docs/` with Spec 046 as guide

## Files to Update

### 1. CLAUDE.md (Root)

**Changes:**
- Fix agent name references: `vedic-backend` → `almamesh-backend`, `vedic-frontend` → `almamesh-frontend`
- Remove Firecrawl MCP references (may not be available)
- Simplify mandatory workflow (4-step agent chain is overkill for minimal project)
- Update project structure to reflect actual `backend/src/almamesh/`
- Remove security-auditor mandatory references (streamline workflow)
- Keep TDD and library-first principles (still valuable)
- Simplify frontend-backend integration section

### 2. .claude/agents/almamesh-backend.md

**Changes:**
- Update project structure to actual layout:
  ```
  backend/src/almamesh/
  ├── __init__.py
  ├── auth.py        # Clerk JWT auth
  ├── config.py      # Pydantic settings
  ├── database.py    # SQLAlchemy models + CRUD
  ├── events.py      # FastStream + Redis event bus
  ├── llm.py         # LiteLLM streaming
  ├── calculations.py # Astronomy calculations
  ├── api.py         # FastAPI routes
  └── workflows.py   # Simple async workflows
  ```
- Remove references to: vedic_core, demo package, poe commands, complex orchestration
- Simplify commands to: `cd backend && uv sync && uv run python -m almamesh.api`
- Keep Vedic astrology domain knowledge (still relevant)
- Remove multi-call LLM orchestration details (not implemented)
- Remove birth time rectification workflow details (not implemented)

### 3. .claude/agents/almamesh-frontend.md

**Changes:**
- Keep structure mostly intact (frontend was copied and is more complete)
- Update monorepo references: `/esoteric/` → `/almamesh/`
- Simplify commands to standard bun commands
- Remove references to features not implemented

### 4. .claude/agents/almamesh-test-orchestrator.md

**Changes:**
- Remove Makefile references (may not exist in minimal project)
- Remove poe command references
- Simplify to basic pytest and bun test commands:
  - Backend: `cd backend && uv run pytest`
  - Frontend: `cd frontend && bun test`
  - E2E: `cd frontend/apps/web && bunx playwright test`
- Keep Playwright MCP integration

### 5. .claude/agents/deployment-sre.md

**Changes:**
- Significantly simplify - minimal project doesn't need complex multi-cloud deployment
- Focus on basic deployment patterns
- Remove Firecrawl MCP references
- Keep .env management principles (still important)

## Execution Order

1. Update CLAUDE.md first (sets the tone for agents)
2. Update almamesh-backend.md (core development agent)
3. Update almamesh-frontend.md (minimal changes needed)
4. Update almamesh-test-orchestrator.md (simplify significantly)
5. Update deployment-sre.md (simplify or remove if not needed)

## Verification Checklist

- [x] All file paths reference `/almamesh/` not `/esoteric/`
- [x] All agent names are consistent (`almamesh-*`)
- [x] Commands work with actual project structure
- [x] No references to non-existent features or tools
- [x] No references to Temporal (removed per Spec 046)
- [x] No references to Firecrawl MCP

## User Preferences

- Keep all 4 agents (simplified versions)
- Maintain library-first development principles
- Preserve TDD workflow guidance

## Success Criteria

1. New developer can onboard using CLAUDE.md without confusion
2. Agent instructions match actual codebase structure
3. All referenced commands execute successfully
4. No 404s or missing file references in agent docs
