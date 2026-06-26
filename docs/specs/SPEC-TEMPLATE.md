# Spec NNN: [Title]

**Status:** Draft | In Progress | Complete
**Created:** YYYY-MM-DD
**Priority:** P0 CRITICAL | P1 HIGH | P2 MEDIUM | P3 LOW
**Dependencies:** [List any specs this depends on]

## Goal

[1-2 sentences: What does this spec achieve and why does it matter?]

---

## Current State

[Brief description of what exists today and what's broken/missing]

---

## Requirements

### Must Have
- Requirement 1
- Requirement 2

### Should Have
- Optional requirement 1

### Out of Scope
- Not doing X
- Not doing Y

---

## Technical Design

[Describe the solution. Include:]
- Domain models (Pydantic classes)
- Key functions/algorithms (pseudocode is fine)
- Data flow diagrams (if helpful)
- API endpoints (if applicable)

```python
# Example code structure
class ExampleModel(BaseModel):
    field: str
```

---

## Files to Create/Modify

| File | Changes |
|------|---------|
| `path/to/file.py` | Add X, modify Y |
| `path/to/new.py` | **NEW** - Description |

---

## Implementation Phases

### Phase 1: [Name]
- Task 1
- Task 2
- Test: `command to verify`

### Phase 2: [Name]
- Task 1
- Task 2

---

## Success Criteria

1. Criterion 1 (measurable)
2. Criterion 2 (measurable)

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Risk 1 | How to handle |

---

## Quality Validation

> **REQUIRED**: All specs must include quality validation before merging.

### Agent Mapping

Select the appropriate Claude Code agents based on your spec's scope:

| Code Type | Agent | Validates |
|-----------|-------|-----------|
| Python backend | `code-quality-backend` | ruff format, ruff check, mypy, pytest |
| React/TypeScript | `code-quality-frontend` | ESLint, TypeScript, component tests |
| Architecture | `architecture-advisor` | Design patterns, schema review, trade-offs |
| CI/CD | `github-actions-agent` | Workflow files, deployment configs |
| Documentation | `docs-sync-agent` | Doc accuracy, spec-code alignment |

### Required Agent Checks

[Select agents relevant to your spec]

**Backend (`code-quality-backend`):**
```bash
# Run via Claude Code Task tool with subagent_type=code-quality-backend
```
- [ ] `ruff format --check backend/src/almamesh/[module]/`
- [ ] `ruff check backend/src/almamesh/[module]/`
- [ ] `mypy backend/src/almamesh/[module]/`
- [ ] `pytest backend/tests/[module]/ -v`

**Frontend (`code-quality-frontend`):**
```bash
# Run via Claude Code Task tool with subagent_type=code-quality-frontend
```
- [ ] `bun run lint`
- [ ] `bun run typecheck`
- [ ] `bun run test`

**Architecture (`architecture-advisor`):**
- [ ] Review design patterns
- [ ] Validate schema/model design
- [ ] Check for architectural alignment with Spec 046

### Testing Requirements

[Include specific test cases that MUST pass]

```python
# Example required tests
def test_example_functionality():
    """Describe what this tests."""
    # Test implementation
    assert result == expected
```

### Security Checklist

[Security considerations specific to this spec]

- [ ] No secrets/credentials in code
- [ ] Input validation on all endpoints
- [ ] Authorization checks (user can only access own data)
- [ ] No SQL injection vulnerabilities
- [ ] Rate limiting on sensitive endpoints

### Pre-Merge Checklist

- [ ] All agent checks pass
- [ ] All tests pass
- [ ] Security checklist complete
- [ ] Code reviewed
- [ ] Documentation updated

---

## References

- Link to relevant docs
- Related specs
