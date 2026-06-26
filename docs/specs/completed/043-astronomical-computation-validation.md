# Feature Specification: Astronomical Computation Validation Framework

**Feature Branch**: `043-astronomical-validation`
**Created**: 2026-01-11
**Status**: Completed
**Priority**: Medium
**Completed**: 2026-01-20
**Result**: 20 validation tests added, 234 total pass
**Overrides**: None

> **Precedence Rule**: Newer specs override older specs when there are contradictions. See SPEC-COMPLETION-TRACKING.md for governance rules.

---

## 1. Summary

A local testing framework to validate Almamesh astrological/astronomical computations against Swiss Ephemeris (ground truth) and optionally other providers. Uses private test cases (friends/family birth data) that are never committed, enabling developers to verify calculation accuracy and identify whether discrepancies stem from Almamesh bugs or configuration differences.

---

## 2. Requirements

### Must Have
- [x] Private cases file format (JSONL) that is gitignored
- [x] Swiss Ephemeris as ground truth with identical configuration (Lahiri ayanamsa, true nodes, whole sign houses)
- [x] Comparison of core calculation points:
  - [x] Planet longitudes (all 9 grahas: Sun, Moon, Mars, Mercury, Jupiter, Venus, Saturn, Rahu, Ketu)
  - [x] Ascendant degree
  - [x] Nakshatra + pada for each planet
- [x] Configurable tolerance levels for discrepancy detection
- [x] Boundary-risk flagging for planets within configurable degrees of sign boundaries
- [x] Console report showing agreement/discrepancy per planet
- [x] Privacy model: private cases never sent to external APIs/LLMs

### Should Have
- [x] Dasha period comparison (Vimshottari)
- [x] House cusp comparison (whole sign system)
- [x] Optional detailed ledger output (local only, gitignored)
- [x] Batch validation across all private cases

### Out of Scope
- External API comparisons (Astro.com, Jagannatha Hora) - future enhancement
- Production deployment or CI/CD integration
- Automated test data generation
- GUI or web interface

### Future Enhancements (deferred)
- Add Astro.com API comparison (requires API key handling)
- Add Jagannatha Hora file import/comparison
- Automated test data generation from public ephemeris tables
- CI integration with synthetic (non-private) test cases
- Performance benchmarking (calculation speed)

---

## 3. Technical Design

### 3.1 Private Cases Format

File location: `backend/tests/fixtures/private_cases.jsonl`

```jsonl
{"case_id": "case_001", "birth_datetime": "1985-03-15T14:30:00", "lat": 12.9716, "lon": 77.5946, "tzid": "Asia/Kolkata"}
{"case_id": "case_002", "birth_datetime": "1990-07-22T06:15:00", "lat": 28.6139, "lon": 77.2090, "tzid": "Asia/Kolkata"}
```

**Field Definitions:**
| Field | Type | Description |
|-------|------|-------------|
| `case_id` | string | Unique identifier (no PII - no names/labels) |
| `birth_datetime` | ISO 8601 | Local birth time (NOT UTC) |
| `lat` | float | Latitude in decimal degrees |
| `lon` | float | Longitude in decimal degrees |
| `tzid` | string | IANA timezone identifier |

### 3.2 Ground Truth: Swiss Ephemeris via Skyfield

Almamesh already uses Skyfield with DE421 ephemeris. The validation framework uses the same underlying Swiss Ephemeris data but with explicit configuration verification:

```python
# Configuration that MUST match between Almamesh and ground truth
VALIDATION_CONFIG = {
    "ayanamsa": "lahiri",           # Lahiri/Chitrapaksha
    "node_type": "true",            # True nodes (not mean)
    "house_system": "whole_sign",   # Whole sign houses
    "ephemeris": "de421.bsp",       # Same ephemeris file
}
```

**Ground Truth Assertion**: If Almamesh matches Swiss Ephemeris with identical config, the calculation is correct.

### 3.3 Tolerance Levels

```python
class ToleranceLevel:
    EXACT = 0.01          # < 0.01 degrees (36 arc-seconds) - perfect match
    ACCEPTABLE = 0.1      # < 0.1 degrees (6 arc-minutes) - acceptable variance
    DISCREPANCY = 0.1     # > 0.1 degrees - requires investigation
    BOUNDARY_RISK = 0.5   # Planet within 0.5 degrees of sign boundary
```

### 3.4 Boundary-Risk Handling

Planets near sign boundaries (within `BOUNDARY_RISK` degrees of 0 or 30 degrees within their sign) are flagged but not automatically reported as bugs:

```python
def is_boundary_risk(longitude: float, threshold: float = 0.5) -> bool:
    """Check if planet is near sign boundary."""
    sign_position = longitude % 30  # Position within sign (0-30)
    return sign_position < threshold or sign_position > (30 - threshold)
```

When providers disagree at boundaries, the report notes "boundary variance" rather than "bug."

### 3.5 Comparison Points

| Calculation | Comparison Method | Tolerance |
|-------------|-------------------|-----------|
| Planet Longitude | Absolute difference | ACCEPTABLE (0.1 deg) |
| Ascendant | Absolute difference | ACCEPTABLE (0.1 deg) |
| Nakshatra | Exact name match | Exact |
| Nakshatra Pada | Integer match | Exact |
| Sign Placement | Derived from longitude | N/A (uses longitude) |
| Dasha Start Date | Days difference | 1 day |
| Dasha Balance | Percentage difference | 0.1% |

### Files to Modify
| File | Change |
|------|--------|
| `backend/.gitignore` | Add `tests/fixtures/private_cases.jsonl` |
| `backend/tests/conftest.py` | Add fixture for loading private cases |

### New Files
| File | Purpose |
|------|---------|
| `backend/tests/validation/__init__.py` | Validation module init |
| `backend/tests/validation/conftest.py` | Validation-specific fixtures |
| `backend/tests/validation/test_private_cases.py` | Main validation test suite |
| `backend/tests/validation/ground_truth.py` | Swiss Ephemeris ground truth calculator |
| `backend/tests/validation/comparators.py` | Comparison logic and tolerance handling |
| `backend/tests/validation/report.py` | Console report generator |
| `backend/tests/fixtures/private_cases.jsonl.example` | Example file format (committed) |

### 3.6 Privacy Model

#### What IS Protected
- Private cases file (`private_cases.jsonl`) is gitignored
- No names, labels, or identifiable information in case IDs
- Birth data never sent to external APIs or LLMs
- Validation output files are gitignored

#### What IS Computed
- Chart calculations are performed locally using Skyfield
- Comparison is purely computational (no external calls)
- Reports show only case_id (e.g., "case_001"), not identities

#### Developer Responsibility
- Never commit private_cases.jsonl
- Use meaningless case_id values (not initials or hints)
- Delete private_cases.jsonl before sharing repository access

---

## 4. Implementation Checkpoints

**CRITICAL: Follow these checkpoints IN ORDER. Test after EACH checkpoint.**

| # | Checkpoint | Files Changed | Test Command | Pass Criteria |
|---|------------|---------------|--------------|---------------|
| 1 | Add gitignore entries | 1 file | `git status` | Private files ignored |
| 2 | Create example file and validation module structure | 3 files | `ls backend/tests/validation/` | Files exist |
| 3 | Implement ground truth calculator | 1 file | `pytest backend/tests/validation/test_ground_truth.py -xvs` | Tests pass |
| 4 | Implement comparators | 1 file | `pytest backend/tests/validation/test_comparators.py -xvs` | Tests pass |
| 5 | Implement private case loader fixture | 2 files | `pytest backend/tests/validation/test_loader.py -xvs` | Tests pass |
| 6 | Implement report generator | 1 file | `pytest backend/tests/validation/test_report.py -xvs` | Tests pass |
| 7 | Implement main validation test | 1 file | `pytest backend/tests/validation/test_private_cases.py -xvs` | Tests pass |
| 8 | Full integration test | - | `pytest backend/tests/validation/ -xvs` | All tests pass |

### Checkpoint Details

#### Checkpoint 1: Add gitignore entries
```
What to do:
- Add to backend/.gitignore:
  tests/fixtures/private_cases.jsonl
  tests/validation/output/

Test:
$ echo '{"test": true}' > backend/tests/fixtures/private_cases.jsonl
$ git status --ignored | grep private_cases
Expected: File is ignored
```

#### Checkpoint 2: Create validation module structure
```
What to do:
- Create backend/tests/validation/__init__.py
- Create backend/tests/validation/conftest.py (empty for now)
- Create backend/tests/fixtures/private_cases.jsonl.example with sample format

Test:
$ ls backend/tests/validation/
Expected: __init__.py, conftest.py exist
```

#### Checkpoint 3: Implement ground truth calculator
```
What to do:
- Create backend/tests/validation/ground_truth.py
- Implement SwissEphemerisGroundTruth class that:
  - Uses Skyfield with DE421 ephemeris
  - Applies Lahiri ayanamsa
  - Calculates true nodes
  - Returns planet longitudes, ascendant, nakshatras

Test:
$ pytest backend/tests/validation/test_ground_truth.py -xvs
Expected: Known date calculations match expected values
```

#### Checkpoint 4: Implement comparators
```
What to do:
- Create backend/tests/validation/comparators.py
- Implement compare_longitudes, compare_nakshatras, is_boundary_risk
- Handle wrap-around at 0/360 degrees

Test:
$ pytest backend/tests/validation/test_comparators.py -xvs
Expected: Comparison logic works correctly
```

#### Checkpoint 5: Implement private case loader
```
What to do:
- Create pytest fixture in conftest.py to load JSONL
- Handle missing file gracefully (skip tests)
- Parse ISO datetime and timezone

Test:
$ pytest backend/tests/validation/test_loader.py -xvs
Expected: Example file loads correctly
```

#### Checkpoint 6: Implement report generator
```
What to do:
- Create backend/tests/validation/report.py
- Console output showing:
  - Case ID
  - Per-planet comparison (longitude, nakshatra)
  - Agreement/discrepancy status
  - Boundary risk warnings

Test:
$ pytest backend/tests/validation/test_report.py -xvs
Expected: Report formats correctly
```

#### Checkpoint 7: Implement main validation test
```
What to do:
- Create backend/tests/validation/test_private_cases.py
- Load private cases (skip if file missing)
- For each case:
  1. Calculate via Almamesh (VedicAstronomy class)
  2. Calculate via ground truth
  3. Compare and report

Test:
$ pytest backend/tests/validation/test_private_cases.py -xvs
Expected: Tests pass (or skip if no private cases)
```

---

## 5. Testing Strategy

### 5.1 Unit Tests
- [ ] `test_ground_truth.py`: Ground truth calculator with known dates
- [ ] `test_comparators.py`: Tolerance checking, boundary detection
- [ ] `test_report.py`: Report formatting

### 5.2 Integration Tests
- [ ] `test_private_cases.py`: Full validation flow (skips if no private cases)

### 5.3 Manual Verification
- [ ] Create personal private_cases.jsonl with known birth data
- [ ] Run validation and verify output makes sense
- [ ] Cross-check one case manually with astro.com or Jagannatha Hora

### 5.4 Example Validation Output

```
================================================================================
ASTRONOMICAL COMPUTATION VALIDATION REPORT
================================================================================
Config: Lahiri ayanamsa, True nodes, Whole sign houses
Cases: 3 loaded from tests/fixtures/private_cases.jsonl

--------------------------------------------------------------------------------
Case: case_001
Birth: 1985-03-15 14:30:00 Asia/Kolkata @ (12.9716, 77.5946)
--------------------------------------------------------------------------------

Planet       | Almamesh   | Ground Truth | Diff    | Status
-------------|------------|--------------|---------|-------------
Sun          | 330.4523   | 330.4518     | 0.0005  | EXACT
Moon         | 89.2341    | 89.2356      | 0.0015  | EXACT
Mars         | 29.8721    | 29.8734      | 0.0013  | BOUNDARY RISK
Mercury      | 315.1234   | 315.1228     | 0.0006  | EXACT
Jupiter      | 276.5432   | 276.5445     | 0.0013  | EXACT
Venus        | 342.8765   | 342.8771     | 0.0006  | EXACT
Saturn       | 234.1234   | 234.1221     | 0.0013  | EXACT
Rahu         | 45.6789    | 45.6801      | 0.0012  | EXACT
Ketu         | 225.6789   | 225.6801     | 0.0012  | EXACT
Ascendant    | 156.3421   | 156.3415     | 0.0006  | EXACT

Nakshatra Check:
  Sun: Revati (4) - MATCH
  Moon: Punarvasu (3) - MATCH
  Mars: Ashwini (1) - MATCH (BOUNDARY: 0.13 deg from Pisces/Aries)
  ...

Summary: 10/10 EXACT | 0 ACCEPTABLE | 0 DISCREPANCY | 1 BOUNDARY RISK
================================================================================
```

---

## 6. Rollback Plan

If issues arise:
1. Delete `backend/tests/validation/` directory
2. Remove gitignore entries
3. No production impact (local testing only)

---

## 7. Definition of Done

- [ ] All checkpoints completed and tested
- [ ] Gitignore entries prevent private data commits
- [ ] Validation passes for at least one known test case
- [ ] Code quality checks pass (ruff, mypy)
- [ ] No sensitive data in committed files
- [ ] README in validation directory explains usage
