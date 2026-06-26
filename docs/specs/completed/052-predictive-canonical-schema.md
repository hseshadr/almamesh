# Spec 052: Predictive Canonical Schema

**Status:** Draft
**Created:** 2026-01-18
**Priority:** P1 HIGH
**Dependencies:** Spec 050 (Composite Dasha Engine), Spec 051 (User Model + Memory)

## Goal

Define the **contract between deterministic engine and LLM** that enforces "super predictive" behavior. Every prediction must include: signals, mechanisms, time windows, outcome bands, triggers, counter-signals, and falsifiers.

This schema makes vague predictions structurally impossible.

---

## The Problem

Without schema enforcement, LLMs produce:

> "You may experience career changes in the coming years. Jupiter's influence suggests growth opportunities."

With schema enforcement, LLMs must produce:

> **Claim:** Career advancement window (confidence: 0.72)
> **Time:** Mar 2027 - Sep 2027
> **Mechanism:** 10L Mars in 11H (gains) + Saturn-Mercury dasha activating 10H
> **Counter-signals:** Saturn retrograde in 6H (workplace friction)
> **Best case (30%):** Promotion with leadership role
> **Base case (50%):** Lateral move with better compensation
> **Worst case (20%):** Delayed due to organizational restructuring
> **Triggers:** Networking in Q1 2027 improves odds; avoiding conflict with authority figures
> **Falsifier:** If no career discussions by June 2027, window likely shifts to 2028

---

## Super Predictive Definition

A response is "super predictive" only if it includes ALL of:

| Component | Description | Required |
|-----------|-------------|----------|
| **Signals** | Chart features used (placements/lords/yogas/dasha/transit/varga) | Yes |
| **Mechanisms** | Why signals imply outcome (astrology logic chain, min 2 steps) | Yes |
| **Time Windows** | Specific dasha + transit windows with dates | Yes |
| **Outcome Bands** | Best/base/worst case with probability mass | Yes |
| **Triggers** | Real-world choices that tilt outcomes | Yes |
| **Counter-Signals** | What in the chart argues against it | Yes |
| **Falsifiers** | What would prove the prediction wrong | Yes |
| **Confidence** | Calibrated probability (0.0-1.0) | Yes |
| **Clarifying Questions** | User questions that reduce uncertainty | Yes |

---

## Architecture: 3-Layer Predictive Pipeline

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     Predictive Pipeline                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ LAYER A: Deterministic Astro Engine (Spec 050)                     │ │
│  │                                                                     │ │
│  │ Input:  Birth data + query timeframe                               │ │
│  │ Output: evidence_catalog + time_windows (raw chart facts)          │ │
│  │                                                                     │ │
│  │ - Dasha periods (Vim + Chara + Yogini)                            │ │
│  │ - Transit windows                                                  │ │
│  │ - Yoga activations                                                 │ │
│  │ - Planetary strengths/afflictions                                  │ │
│  │ - NO interpretation, just facts                                    │ │
│  └──────────────────────────────┬─────────────────────────────────────┘ │
│                                 │                                        │
│                                 ▼                                        │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ LAYER B: Predictive Claim Generator (DeepSeek/Claude)              │ │
│  │                                                                     │ │
│  │ Input:  evidence_catalog + time_windows + rule_catalog + query     │ │
│  │ Output: Predictive Canonical JSON (this spec)                      │ │
│  │                                                                     │ │
│  │ - Generates predictive_claims with mechanisms                      │ │
│  │ - Links evidence → inference → outcome                             │ │
│  │ - Must reference only existing evidence_ids                        │ │
│  │ - Cannot invent chart facts                                        │ │
│  └──────────────────────────────┬─────────────────────────────────────┘ │
│                                 │                                        │
│                                 ▼                                        │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ LAYER C: Conversational Forecaster (MiniMax/Claude)                │ │
│  │                                                                     │ │
│  │ Input:  Predictive Canonical JSON + user message + user memory     │ │
│  │ Output: Natural language response                                  │ │
│  │                                                                     │ │
│  │ - Translates claims to human language                             │ │
│  │ - Asks clarifying questions                                        │ │
│  │ - Provides actionable triggers + watch-fors                       │ │
│  │ - CANNOT invent new astrology facts                               │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ LAYER D: Premium Arbiter (Optional - GLM/Opus)                     │ │
│  │                                                                     │ │
│  │ Triggered only when:                                               │ │
│  │ - User asks "when" + "why" across 2+ domains                      │ │
│  │ - Top claim confidence < 0.55                                      │ │
│  │ - Strong counter-signals on top claims                            │ │
│  │ - High-stakes: marriage, job quit, relocation                     │ │
│  │                                                                     │ │
│  │ Output: Conflict resolution + revised priorities + sequence        │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Predictive Canonical Schema

### Core Schema (`predictive_canonical.schema.json`)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "AlmaMesh Predictive Canonical Output",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schema_version",
    "chart_id",
    "generated_at",
    "evidence_catalog",
    "time_windows",
    "predictive_claims",
    "domain_forecasts",
    "uncertainty",
    "clarifying_questions",
    "safety"
  ],
  "properties": {
    "schema_version": {
      "type": "string",
      "const": "1.0"
    },
    "chart_id": {
      "type": "string",
      "description": "Reference to the natal chart"
    },
    "generated_at": {
      "type": "string",
      "format": "date-time"
    },

    "evidence_catalog": {
      "description": "All chart facts available for claims. Layer A output.",
      "type": "array",
      "items": { "$ref": "#/$defs/Evidence" }
    },

    "time_windows": {
      "description": "All date-bounded windows referenced by claims.",
      "type": "array",
      "items": { "$ref": "#/$defs/TimeWindow" }
    },

    "predictive_claims": {
      "description": "Atomic predictive assertions with full structure.",
      "type": "array",
      "items": { "$ref": "#/$defs/PredictiveClaim" }
    },

    "domain_forecasts": {
      "description": "Top-level summaries per life domain.",
      "type": "array",
      "items": { "$ref": "#/$defs/DomainForecast" }
    },

    "uncertainty": {
      "$ref": "#/$defs/Uncertainty"
    },

    "clarifying_questions": {
      "description": "Questions that tighten probabilities.",
      "type": "array",
      "minItems": 2,
      "maxItems": 8,
      "items": { "$ref": "#/$defs/ClarifyingQuestion" }
    },

    "safety": {
      "$ref": "#/$defs/SafetyFlags"
    }
  },

  "$defs": {
    "Evidence": {
      "type": "object",
      "additionalProperties": false,
      "required": ["evidence_id", "type", "payload"],
      "properties": {
        "evidence_id": { "type": "string", "pattern": "^E[0-9]+$" },
        "type": {
          "type": "string",
          "enum": [
            "placement",
            "lordship",
            "aspect",
            "yoga",
            "strength",
            "affliction",
            "dasha_period",
            "transit",
            "varga",
            "confluence"
          ]
        },
        "payload": {
          "type": "object",
          "description": "Type-specific data (planet, house, sign, dates, etc.)"
        }
      }
    },

    "TimeWindow": {
      "type": "object",
      "additionalProperties": false,
      "required": ["window_id", "start_date", "end_date", "drivers", "intensity"],
      "properties": {
        "window_id": { "type": "string", "pattern": "^W[0-9]+$" },
        "start_date": { "type": "string", "format": "date" },
        "end_date": { "type": "string", "format": "date" },
        "drivers": {
          "type": "array",
          "items": { "type": "string" },
          "description": "evidence_ids that create this window"
        },
        "intensity": {
          "type": "string",
          "enum": ["low", "moderate", "high", "peak"]
        },
        "notes": { "type": "string" }
      }
    },

    "PredictiveClaim": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "claim_id",
        "domain",
        "headline",
        "mechanism",
        "time_window_ids",
        "outcomes",
        "confidence",
        "evidence_ids",
        "counter_evidence_ids",
        "triggers",
        "falsifiers"
      ],
      "properties": {
        "claim_id": { "type": "string", "pattern": "^C[0-9]+$" },

        "domain": {
          "type": "string",
          "enum": [
            "career",
            "relationships",
            "finance",
            "health",
            "spiritual",
            "family",
            "relocation",
            "education",
            "timing"
          ]
        },

        "headline": {
          "type": "string",
          "description": "One-line summary of the prediction"
        },

        "mechanism": {
          "description": "Astrology logic chain: signals → interpretation → outcome",
          "type": "array",
          "minItems": 2,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["step", "evidence_ids", "inference", "rule_id"],
            "properties": {
              "step": { "type": "integer", "minimum": 1 },
              "evidence_ids": {
                "type": "array",
                "items": { "type": "string" }
              },
              "inference": { "type": "string" },
              "rule_id": { "type": "string" }
            }
          }
        },

        "time_window_ids": {
          "type": "array",
          "minItems": 1,
          "items": { "type": "string" }
        },

        "outcomes": {
          "type": "object",
          "additionalProperties": false,
          "required": ["best_case", "base_case", "worst_case"],
          "properties": {
            "best_case": { "$ref": "#/$defs/OutcomeBand" },
            "base_case": { "$ref": "#/$defs/OutcomeBand" },
            "worst_case": { "$ref": "#/$defs/OutcomeBand" }
          }
        },

        "confidence": {
          "type": "number",
          "minimum": 0,
          "maximum": 1,
          "description": "Calibrated probability that claim manifests"
        },

        "evidence_ids": {
          "type": "array",
          "minItems": 1,
          "items": { "type": "string" },
          "description": "Supporting evidence from catalog"
        },

        "counter_evidence_ids": {
          "type": "array",
          "items": { "type": "string" },
          "description": "Evidence that weakens or contradicts claim"
        },

        "triggers": {
          "type": "array",
          "items": { "$ref": "#/$defs/Trigger" },
          "description": "Real-world actions that affect outcomes"
        },

        "falsifiers": {
          "type": "array",
          "items": { "type": "string" },
          "description": "If these happen, claim is likely wrong"
        }
      }
    },

    "OutcomeBand": {
      "type": "object",
      "additionalProperties": false,
      "required": ["description", "likelihood"],
      "properties": {
        "description": { "type": "string" },
        "likelihood": {
          "type": "number",
          "minimum": 0,
          "maximum": 1
        }
      }
    },

    "Trigger": {
      "type": "object",
      "additionalProperties": false,
      "required": ["action", "effect", "direction"],
      "properties": {
        "action": { "type": "string" },
        "effect": { "type": "string" },
        "direction": {
          "type": "string",
          "enum": ["improves", "worsens", "shifts_timing"]
        }
      }
    },

    "DomainForecast": {
      "type": "object",
      "additionalProperties": false,
      "required": ["domain", "summary", "top_claim_ids", "priority_windows"],
      "properties": {
        "domain": { "type": "string" },
        "summary": { "type": "string" },
        "top_claim_ids": {
          "type": "array",
          "items": { "type": "string" }
        },
        "priority_windows": {
          "type": "array",
          "items": { "type": "string" }
        }
      }
    },

    "Uncertainty": {
      "type": "object",
      "additionalProperties": false,
      "required": ["unknowns", "sensitivity_factors"],
      "properties": {
        "unknowns": {
          "type": "array",
          "items": { "type": "string" },
          "description": "Missing information that affects predictions"
        },
        "sensitivity_factors": {
          "type": "array",
          "items": { "type": "string" },
          "description": "Variables that most change the forecast"
        }
      }
    },

    "ClarifyingQuestion": {
      "type": "object",
      "additionalProperties": false,
      "required": ["question", "why_it_matters", "affects_claim_ids"],
      "properties": {
        "question": { "type": "string" },
        "why_it_matters": { "type": "string" },
        "affects_claim_ids": {
          "type": "array",
          "items": { "type": "string" }
        }
      }
    },

    "SafetyFlags": {
      "type": "object",
      "additionalProperties": false,
      "required": ["medical_disclaimer", "no_guarantees"],
      "properties": {
        "medical_disclaimer": { "type": "boolean" },
        "no_guarantees": { "type": "boolean" }
      }
    }
  }
}
```

---

## Rule Catalog Structure

The `rule_id` references in mechanisms point to a catalog of astrological rules. This makes interpretations auditable and consistent.

### Directory Structure

```
backend/src/almamesh/rules/
├── __init__.py
├── rule_types.py          # Pydantic models
├── career_rules.yaml
├── relationship_rules.yaml
├── finance_rules.yaml
├── health_rules.yaml
├── timing_rules.yaml
└── general_rules.yaml
```

### Rule Schema

```python
class AstrologicalRule(BaseModel):
    """Single interpretive rule with evidence."""
    rule_id: str                          # e.g., "R_10L_11H"
    category: str                         # "career", "relationship", etc.
    pattern: str                          # "10th lord in 11th house"
    interpretation: str                   # "career gains through networks"
    strength_modifier: float = 1.0        # Multiplier for claim confidence
    requires_dignity: bool = False        # Only applies if planet is dignified
    classical_source: str | None = None   # "BPHS 35.12", "Phaladeepika 6.8"
    counter_patterns: list[str] = []      # Patterns that negate this rule
    tags: list[str] = []                  # ["promotion", "gains", "11H"]


class RuleCatalog(BaseModel):
    """Collection of rules for a domain."""
    domain: str
    rules: list[AstrologicalRule]

    def find_by_pattern(self, pattern: str) -> AstrologicalRule | None:
        """Find rule matching a chart pattern."""
        for rule in self.rules:
            if rule.pattern == pattern:
                return rule
        return None

    def find_by_tags(self, tags: list[str]) -> list[AstrologicalRule]:
        """Find all rules matching any of the tags."""
        return [r for r in self.rules if any(t in r.tags for t in tags)]
```

### Example Rule File (`career_rules.yaml`)

```yaml
domain: career
rules:
  # Lordship placements
  - rule_id: R_10L_11H
    pattern: "10th lord in 11th house"
    interpretation: "Career advancement through networks, organizations, or group activities"
    strength_modifier: 1.2
    classical_source: "BPHS 24.15"
    tags: ["promotion", "gains", "networking", "10H", "11H"]
    counter_patterns:
      - "10th lord debilitated"
      - "11th house afflicted by malefics"

  - rule_id: R_10L_9H
    pattern: "10th lord in 9th house"
    interpretation: "Career involving higher learning, publishing, or international work"
    strength_modifier: 1.15
    classical_source: "BPHS 24.14"
    tags: ["education", "travel", "publishing", "10H", "9H"]

  - rule_id: R_10L_DASHA
    pattern: "10th lord dasha active"
    interpretation: "Career themes activated; professional focus intensifies"
    strength_modifier: 1.3
    tags: ["timing", "dasha", "activation", "10H"]

  # Yogas
  - rule_id: R_RAJA_YOGA_CAREER
    pattern: "Raja Yoga involving 10th house"
    interpretation: "Period of professional authority and recognition"
    strength_modifier: 1.4
    classical_source: "BPHS 41.1"
    tags: ["raja_yoga", "authority", "recognition", "10H"]

  - rule_id: R_DHANA_YOGA_10H
    pattern: "Dhana Yoga with 10th lord involvement"
    interpretation: "Wealth through career; salary increase or business profits"
    strength_modifier: 1.25
    tags: ["dhana_yoga", "wealth", "salary", "10H"]

  # Transits
  - rule_id: R_JUPITER_TRANSIT_10H
    pattern: "Jupiter transiting 10th house"
    interpretation: "Expansion and opportunities in career"
    strength_modifier: 1.15
    tags: ["transit", "jupiter", "expansion", "10H"]

  - rule_id: R_SATURN_TRANSIT_10H
    pattern: "Saturn transiting 10th house"
    interpretation: "Restructuring, responsibility, or delays in career"
    strength_modifier: 0.9
    counter_patterns:
      - "Saturn in own sign"
      - "Saturn exalted"
    tags: ["transit", "saturn", "restructuring", "delay", "10H"]

  # Afflictions
  - rule_id: R_10H_AFFLICTED
    pattern: "10th house/lord afflicted by malefics"
    interpretation: "Career obstacles, conflicts with authority"
    strength_modifier: 0.7
    tags: ["affliction", "obstacle", "conflict", "10H"]

  # Strength considerations
  - rule_id: R_10L_STRONG
    pattern: "10th lord dignified (exalted/own sign)"
    interpretation: "Strong career potential; natural authority"
    strength_modifier: 1.2
    requires_dignity: true
    tags: ["strength", "dignity", "10H"]

  - rule_id: R_10L_WEAK
    pattern: "10th lord debilitated or combust"
    interpretation: "Career challenges; need for extra effort"
    strength_modifier: 0.6
    tags: ["weakness", "debilitation", "10H"]
```

---

## Evidence Catalog (Layer A Output)

Spec 050's Composite Dasha Engine outputs the `evidence_catalog`. Each evidence type has a specific payload structure:

```python
class EvidenceType(str, Enum):
    PLACEMENT = "placement"
    LORDSHIP = "lordship"
    ASPECT = "aspect"
    YOGA = "yoga"
    STRENGTH = "strength"
    AFFLICTION = "affliction"
    DASHA_PERIOD = "dasha_period"
    TRANSIT = "transit"
    VARGA = "varga"
    CONFLUENCE = "confluence"


# Payload schemas per evidence type
class PlacementPayload(BaseModel):
    planet: str
    house: int
    sign: str
    degree: float
    nakshatra: str
    dignity: str | None


class LordshipPayload(BaseModel):
    planet: str
    houses_ruled: list[int]
    placed_in_house: int
    placed_in_sign: str


class DashaPeriodPayload(BaseModel):
    system: str                    # "vimshottari", "chara", "yogini"
    level: str                     # "maha", "antar", "pratyantar"
    planet: str
    start_date: date
    end_date: date
    houses_activated: list[int]


class TransitPayload(BaseModel):
    planet: str
    natal_house: int
    transit_house: int
    start_date: date
    end_date: date
    aspect_to_natal: list[str]     # ["conjunct Sun", "aspect 7H"]


class YogaPayload(BaseModel):
    yoga_name: str
    category: str
    planets_involved: list[str]
    houses_involved: list[int]
    strength: float
    active_during: list[str]       # window_ids when yoga is activated


class ConfluencePayload(BaseModel):
    """When multiple systems agree (Spec 050 output)."""
    systems_agreeing: list[str]    # ["vimshottari", "chara", "yogini"]
    event_type: str
    confluence_score: float
    window_id: str
```

---

## LLM System Prompts

### Layer B: Predictive Claim Generator

```text
You are AlmaMesh Predictive Engine.

Output ONLY valid JSON matching the Predictive Canonical Schema.
No markdown. No prose outside JSON fields. No extra keys.

You MUST generate predictive_claims that are:
1. TIME-BOUNDED: Every claim references at least one time_window_id
2. EVIDENCE-BACKED: Every claim references evidence_ids from evidence_catalog
3. MECHANISM-EXPLAINED: At least 2 mechanism steps with rule_id references
4. COUNTER-BALANCED: Include counter_evidence_ids when chart has opposing signals
5. OUTCOME-BANDED: best/base/worst case with probabilities summing to ~1.0
6. FALSIFIABLE: Include at least one falsifier per claim
7. ACTIONABLE: Include triggers that affect outcomes

You MUST NOT:
- Invent any chart fact not in evidence_catalog
- Invent any yoga not listed
- Invent any dasha period not in time_windows
- Provide medical diagnoses
- Guarantee outcomes
- Use rule_ids not in the rule catalog

If information is missing:
- Add it to uncertainty.unknowns
- Generate clarifying_questions to resolve it

CONFIDENCE CALIBRATION:
- 0.8+ : Multiple confluent signals, no counter-evidence
- 0.6-0.8 : Strong signals with minor counter-evidence
- 0.4-0.6 : Mixed signals, outcome uncertain
- 0.2-0.4 : Weak signals or strong counter-evidence
- <0.2 : Speculation only
```

### Layer C: Conversational Forecaster

```text
You are AlmaMesh Conversational Forecaster.

You are NOT allowed to compute astrology or invent chart facts.

You may ONLY reference:
1. predictive_canonical JSON (the authoritative source)
2. User messages and profile
3. User memory context

You MUST:
- Explain predictions by referencing claim headlines and mechanisms in plain language
- Always mention relevant time windows with specific dates
- Offer actionable triggers ("what to do") and watch-fors ("what to notice")
- Ask clarifying questions exactly as provided in the JSON
- Respect user communication preferences (direct/gentle, technical/simple)

You MUST NOT:
- Assert any placement, yoga, dasha, or transit not in the canonical JSON
- Invent new astrological interpretations
- Contradict the canonical JSON's claims or confidence levels
- Make guarantees about outcomes

If the user asks about something not in the canonical JSON:
- Acknowledge the limitation
- Suggest what additional analysis would be needed
- Do not speculate
```

### Layer D: Premium Arbiter (Optional)

```text
You are AlmaMesh Premium Arbiter.

You are called only for complex, high-stakes, or conflicting predictions.

Your job is NOT to recompute astrology, but to:
1. Resolve conflicts between predictive claims
2. Prioritize time windows when multiple overlap
3. Generate a "most likely sequence" narrative
4. Identify what data would most reduce uncertainty

Input: Predictive Canonical JSON with multiple claims
Output: Arbiter Resolution JSON

You must be conservative. When in doubt:
- Favor the claim with more evidence_ids
- Reduce confidence when strong counter_evidence exists
- Recommend clarifying questions before high-stakes decisions
```

---

## Arbiter Resolution Schema

```json
{
  "arbiter_version": "1.0",
  "resolved_priorities": [
    {
      "claim_id": "C1",
      "original_confidence": 0.65,
      "adjusted_confidence": 0.72,
      "adjustment_reason": "Confluence with C3 strengthens prediction",
      "priority_rank": 1
    }
  ],
  "conflict_resolutions": [
    {
      "claim_a": "C1",
      "claim_b": "C2",
      "conflict_type": "timing_overlap",
      "resolution": "C1 likely precedes C2; career change enables relocation",
      "revised_sequence": ["C1", "C2"]
    }
  ],
  "sequence_hypothesis": [
    {
      "window_id": "W1",
      "period": "Mar-Jun 2027",
      "likely_events": ["Career discussions begin", "Networking pays off"],
      "watch_fors": ["Unexpected job offer", "Leadership opportunity"]
    }
  ],
  "data_requests": [
    "Exact birth time (current ±15 min) would tighten window by 2 months",
    "User's current job satisfaction would adjust career claim confidence"
  ]
}
```

---

## Validation Logic

```python
from jsonschema import validate, ValidationError
import json

class PredictiveCanonicalValidator:
    """Validates Predictive Canonical JSON output."""

    def __init__(self, schema_path: str):
        with open(schema_path) as f:
            self.schema = json.load(f)

    def validate(self, canonical: dict) -> list[str]:
        """Validate and return list of errors (empty if valid)."""
        errors = []

        # 1. JSON Schema validation
        try:
            validate(instance=canonical, schema=self.schema)
        except ValidationError as e:
            errors.append(f"Schema error: {e.message}")
            return errors  # Can't continue if schema invalid

        # 2. Referential integrity: evidence_ids must exist
        evidence_ids = {e["evidence_id"] for e in canonical["evidence_catalog"]}
        window_ids = {w["window_id"] for w in canonical["time_windows"]}

        for claim in canonical["predictive_claims"]:
            # Check evidence references
            for eid in claim["evidence_ids"]:
                if eid not in evidence_ids:
                    errors.append(f"Claim {claim['claim_id']}: unknown evidence_id {eid}")

            for eid in claim.get("counter_evidence_ids", []):
                if eid not in evidence_ids:
                    errors.append(f"Claim {claim['claim_id']}: unknown counter_evidence_id {eid}")

            # Check window references
            for wid in claim["time_window_ids"]:
                if wid not in window_ids:
                    errors.append(f"Claim {claim['claim_id']}: unknown time_window_id {wid}")

            # Check mechanism evidence references
            for step in claim["mechanism"]:
                for eid in step["evidence_ids"]:
                    if eid not in evidence_ids:
                        errors.append(f"Claim {claim['claim_id']} mechanism: unknown evidence_id {eid}")

        # 3. Outcome bands should sum to ~1.0
        for claim in canonical["predictive_claims"]:
            outcomes = claim["outcomes"]
            total = (
                outcomes["best_case"]["likelihood"] +
                outcomes["base_case"]["likelihood"] +
                outcomes["worst_case"]["likelihood"]
            )
            if not (0.95 <= total <= 1.05):
                errors.append(
                    f"Claim {claim['claim_id']}: outcome likelihoods sum to {total}, expected ~1.0"
                )

        # 4. At least one falsifier per claim
        for claim in canonical["predictive_claims"]:
            if not claim["falsifiers"]:
                errors.append(f"Claim {claim['claim_id']}: missing falsifiers")

        # 5. Clarifying questions reference valid claims
        claim_ids = {c["claim_id"] for c in canonical["predictive_claims"]}
        for q in canonical["clarifying_questions"]:
            for cid in q["affects_claim_ids"]:
                if cid not in claim_ids:
                    errors.append(f"Clarifying question references unknown claim_id {cid}")

        return errors

    def is_super_predictive(self, canonical: dict) -> bool:
        """Check if output meets 'super predictive' bar."""
        errors = self.validate(canonical)
        if errors:
            return False

        # Additional quality checks
        for claim in canonical["predictive_claims"]:
            # Must have mechanism with 2+ steps
            if len(claim["mechanism"]) < 2:
                return False

            # Must have triggers
            if not claim["triggers"]:
                return False

            # Must have reasonable confidence (not all 0.5)
            if claim["confidence"] == 0.5:
                return False  # Likely placeholder

        # Must have clarifying questions
        if len(canonical["clarifying_questions"]) < 2:
            return False

        return True
```

---

## Example: Complete Request/Response Flow

### Step 1: User Query

```
"When will I get a promotion? I've been at my company for 3 years and feel stuck."
```

### Step 2: Layer A Output (Evidence Catalog)

```json
{
  "evidence_catalog": [
    {"evidence_id": "E1", "type": "placement", "payload": {"planet": "Mars", "house": 10, "sign": "Capricorn", "dignity": "exalted"}},
    {"evidence_id": "E2", "type": "lordship", "payload": {"planet": "Mars", "houses_ruled": [10, 5], "placed_in_house": 10}},
    {"evidence_id": "E3", "type": "dasha_period", "payload": {"system": "vimshottari", "level": "maha", "planet": "Saturn", "start_date": "2025-01-01", "end_date": "2032-01-01", "houses_activated": [7, 8]}},
    {"evidence_id": "E4", "type": "dasha_period", "payload": {"system": "vimshottari", "level": "antar", "planet": "Mercury", "start_date": "2027-03-15", "end_date": "2029-09-15", "houses_activated": [11, 2]}},
    {"evidence_id": "E5", "type": "transit", "payload": {"planet": "Jupiter", "transit_house": 10, "start_date": "2027-04-01", "end_date": "2028-04-01"}},
    {"evidence_id": "E6", "type": "yoga", "payload": {"yoga_name": "Raja Yoga", "planets_involved": ["Mars", "Jupiter"], "houses_involved": [10, 9], "strength": 82}},
    {"evidence_id": "E7", "type": "affliction", "payload": {"planet": "Saturn", "type": "retrograde", "house": 7, "impact": "delays in partnerships"}}
  ],
  "time_windows": [
    {"window_id": "W1", "start_date": "2027-03-15", "end_date": "2027-09-30", "drivers": ["E4", "E5"], "intensity": "high"},
    {"window_id": "W2", "start_date": "2028-01-01", "end_date": "2028-06-30", "drivers": ["E5"], "intensity": "moderate"}
  ]
}
```

### Step 3: Layer B Output (Predictive Canonical)

```json
{
  "schema_version": "1.0",
  "chart_id": "chart_abc123",
  "generated_at": "2026-01-18T10:30:00Z",

  "evidence_catalog": ["...from above..."],
  "time_windows": ["...from above..."],

  "predictive_claims": [
    {
      "claim_id": "C1",
      "domain": "career",
      "headline": "Career advancement window: March-September 2027",

      "mechanism": [
        {
          "step": 1,
          "evidence_ids": ["E1", "E2"],
          "inference": "10th lord Mars exalted in 10th house indicates strong career foundation",
          "rule_id": "R_10L_STRONG"
        },
        {
          "step": 2,
          "evidence_ids": ["E4"],
          "inference": "Mercury antardasha activates 11th house (gains) during Saturn mahadasha",
          "rule_id": "R_10L_DASHA"
        },
        {
          "step": 3,
          "evidence_ids": ["E5"],
          "inference": "Jupiter transit through 10th house expands career opportunities",
          "rule_id": "R_JUPITER_TRANSIT_10H"
        }
      ],

      "time_window_ids": ["W1"],

      "outcomes": {
        "best_case": {
          "description": "Promotion to leadership role with significant salary increase",
          "likelihood": 0.30
        },
        "base_case": {
          "description": "Advancement through expanded responsibilities or title change",
          "likelihood": 0.50
        },
        "worst_case": {
          "description": "Recognition without formal promotion; sets up 2028 advancement",
          "likelihood": 0.20
        }
      },

      "confidence": 0.72,

      "evidence_ids": ["E1", "E2", "E4", "E5", "E6"],

      "counter_evidence_ids": ["E7"],

      "triggers": [
        {
          "action": "Actively communicate achievements to leadership in Q1 2027",
          "effect": "Increases visibility during Jupiter transit",
          "direction": "improves"
        },
        {
          "action": "Avoid major conflicts with authority figures",
          "effect": "Saturn retrograde can amplify workplace friction",
          "direction": "worsens"
        },
        {
          "action": "Consider lateral moves if internal promotion stalls by June",
          "effect": "External opportunities may be stronger than internal",
          "direction": "shifts_timing"
        }
      ],

      "falsifiers": [
        "No career-related conversations or opportunities by June 2027",
        "Company undergoes major restructuring/layoffs in Q1 2027",
        "Health issues significantly impact work capacity"
      ]
    }
  ],

  "domain_forecasts": [
    {
      "domain": "career",
      "summary": "Strong advancement potential in 2027, particularly March-September. Jupiter's transit through your 10th house combined with Mercury antardasha creates a notable opportunity window.",
      "top_claim_ids": ["C1"],
      "priority_windows": ["W1"]
    }
  ],

  "uncertainty": {
    "unknowns": [
      "Current relationship with direct manager",
      "Company's financial health and growth trajectory",
      "User's preference: promotion vs. job change"
    ],
    "sensitivity_factors": [
      "Birth time accuracy (±15 min could shift window by 1-2 months)",
      "Saturn retrograde impact depends on natal Saturn strength"
    ]
  },

  "clarifying_questions": [
    {
      "question": "Are you open to changing companies, or focused on advancing where you are?",
      "why_it_matters": "External opportunities may be stronger than internal during this window",
      "affects_claim_ids": ["C1"]
    },
    {
      "question": "How would you describe your relationship with your current manager?",
      "why_it_matters": "Saturn retrograde in 7th can indicate partnership friction; good relationships buffer this",
      "affects_claim_ids": ["C1"]
    },
    {
      "question": "Is your company growing, stable, or contracting?",
      "why_it_matters": "Jupiter transit benefits are amplified in growing environments",
      "affects_claim_ids": ["C1"]
    }
  ],

  "safety": {
    "medical_disclaimer": false,
    "no_guarantees": true
  }
}
```

### Step 4: Layer C Output (Natural Language)

```
Based on your chart, I see a strong career advancement window opening from
**March to September 2027**.

**Why this timing?**
Your 10th lord Mars is exalted in the 10th house—this is an exceptional
placement for career authority. During the Mercury sub-period starting
March 2027, your 11th house of gains becomes activated. Jupiter will also
be transiting your 10th house throughout this period, expanding opportunities.

**What's most likely:**
- **Best case (30%)**: Promotion to a leadership role with significant raise
- **Base case (50%)**: Expanded responsibilities or title change
- **Worst case (20%)**: Recognition without formal promotion, setting up 2028

**What could work against this:**
Saturn is retrograde in your 7th house, which can create friction in
professional relationships. This isn't a dealbreaker, but it means managing
workplace dynamics carefully.

**What you can do:**
1. Make your achievements visible to leadership in early 2027
2. Avoid conflicts with authority figures (Saturn retrograde amplifies friction)
3. If nothing moves internally by June, external opportunities may be stronger

**How I'd know I'm wrong:**
If you have no career conversations or opportunities by June 2027, the window
may be shifting to 2028 instead.

**Questions that would sharpen this:**
- Are you open to changing companies, or focused on internal advancement?
- How's your relationship with your current manager?
- Is your company growing, stable, or contracting?
```

---

## Files to Create/Modify

| File | Changes |
|------|---------|
| `backend/src/almamesh/schemas/predictive_canonical.schema.json` | **NEW** - JSON Schema |
| `backend/src/almamesh/predictive/canonical.py` | **NEW** - Pydantic models + validator |
| `backend/src/almamesh/predictive/claim_generator.py` | **NEW** - Layer B logic |
| `backend/src/almamesh/rules/` | **NEW** - Rule catalog directory |
| `backend/src/almamesh/rules/career_rules.yaml` | **NEW** - Career rules |
| `backend/src/almamesh/rules/relationship_rules.yaml` | **NEW** - Relationship rules |
| `backend/src/almamesh/llm.py` | Update prompts for Layer C |
| `backend/src/almamesh/api.py` | Add `/predict/timeline` endpoint |

---

## Implementation Phases

### Phase 1: Schema + Validation
- Create JSON schema file
- Create Pydantic models
- Implement validator with referential integrity checks
- Unit tests for validation

### Phase 2: Rule Catalog
- Define rule schema
- Create career_rules.yaml
- Create relationship_rules.yaml
- Rule lookup functions

### Phase 3: Evidence Catalog Integration
- Update Spec 050 to output evidence_catalog format
- Map dasha periods → evidence entries
- Map transits → evidence entries
- Map yogas → evidence entries

### Phase 4: Layer B (Claim Generator)
- System prompt implementation
- LLM call with schema enforcement
- Validation of LLM output
- Retry logic for invalid outputs

### Phase 5: Layer C (Conversational)
- Update llm.py prompts
- Natural language rendering of claims
- Clarifying question flow
- Integration with user memory (Spec 051)

### Phase 6: Layer D (Arbiter - Optional)
- Trigger conditions
- Arbiter prompt
- Conflict resolution logic

---

## Success Criteria

1. **Schema Enforced**: LLM output fails validation if missing required fields
2. **No Invented Facts**: Every evidence_id in claims exists in catalog
3. **Auditable Mechanisms**: Every claim has traceable logic chain
4. **Calibrated Confidence**: Predictions with 0.7+ confidence are right >60% of time
5. **Falsifiable**: Users can report when predictions were wrong
6. **Actionable**: Every prediction includes triggers user can act on

---

## References

- Spec 050: Composite Dasha Engine (provides Layer A)
- Spec 051: User Model + Memory (provides personalization)
- JSON Schema Draft-07 Specification
- BPHS (Brihat Parashara Hora Shastra) for classical rules
