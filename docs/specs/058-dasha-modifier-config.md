# Spec 058: Dasha Modifier YAML Configuration

**Status:** Draft
**Created:** 2025-01-22
**Priority:** P2 MEDIUM
**Dependencies:** Spec 054 (Classification), Spec 056 (API)

## Goal

Define a YAML-based configuration system for Dasha-specific karma modifiers, opportunities, warnings, and themes. This externalizes astrological logic from code, enabling:
- Easy tuning without code changes
- Domain expert editing
- A/B testing different configurations

---

## Current State

- Dasha modifiers hardcoded in Spec 054/055
- No external configuration for astrological rules
- Opportunities/warnings defined inline in API code

---

## Requirements

### Must Have
- YAML schema for all 9 Mahadasha lords
- Category multipliers per Dasha
- Penalty multipliers per Dasha
- Opportunity templates with examples
- Warning lists

### Should Have
- Antar Dasha modifiers (planet combinations)
- Seasonal/transit overlays
- Validation schema (JSON Schema or Pydantic)

### Out of Scope
- Runtime YAML editing (admin UI)
- Per-user Dasha customization
- Prashna (horary) configurations

---

## Technical Design

### 1. Configuration File Location

```
backend/
├── src/
│   └── almamesh/
│       └── karma/
│           ├── config/
│           │   ├── dasha_modifiers.yaml    # Main config
│           │   └── schema.json              # Validation schema
│           └── config_loader.py             # Load & validate
```

### 2. YAML Schema

```yaml
# backend/src/almamesh/karma/config/dasha_modifiers.yaml

# Dasha Modifier Configuration for AlmaMesh Karma System
# Each Mahadasha lord has specific multipliers, opportunities, and warnings

version: "1.0"
updated: "2025-01-22"

# Global defaults (applied when Dasha not specified)
defaults:
  category_multipliers:
    service: 1.0
    responsibility: 1.0
    restraint: 1.0
    growth: 1.0
    generosity: 1.0
  penalty_multipliers:
    avoidance: 1.0
    inflation: 1.0
    harm: 1.5
  opportunities: []
  warnings: []

# Per-Dasha configurations
dashas:
  # ===================
  # SATURN (Shani)
  # ===================
  Saturn:
    themes:
      - responsibility
      - discipline
      - service
      - patience
      - endurance
      - structure
      - karma clearing

    description: |
      Saturn Dasha emphasizes duty, delayed gratification, and service to others.
      Karma burns most efficiently through patient acceptance of responsibility.
      Avoidance and victim narratives are heavily penalized.

    category_multipliers:
      service: 1.2
      responsibility: 1.5
      restraint: 1.5
      growth: 1.0
      generosity: 1.0

    penalty_multipliers:
      avoidance: 2.0
      inflation: 1.3
      harm: 2.0

    opportunities:
      - action_type: service
        description: Help someone without expectation of recognition
        potential_delta: -1.5
        dasha_alignment: high
        example: Assist an elderly neighbor with errands without telling anyone

      - action_type: responsibility
        description: Accept a difficult duty you've been avoiding
        potential_delta: -1.8
        dasha_alignment: high
        example: Have that overdue difficult conversation with a family member

      - action_type: restraint
        description: Practice conscious non-reaction to provocation
        potential_delta: -1.2
        dasha_alignment: high
        example: Stay calm and measured when criticized unfairly at work

      - action_type: service
        description: Care for dependents or elders
        potential_delta: -1.6
        dasha_alignment: high
        example: Spend quality time with aging parents or help a struggling colleague

      - action_type: responsibility
        description: Complete a long-delayed obligation
        potential_delta: -1.4
        dasha_alignment: high
        example: Finish that project, pay that debt, or fulfill that promise

    warnings:
      - Avoiding difficult conversations or responsibilities
      - Victim narratives and external blame
      - Escapism through substances or entertainment
      - Neglecting duties to dependents
      - Shortcuts that bypass hard work

  # ===================
  # JUPITER (Guru)
  # ===================
  Jupiter:
    themes:
      - wisdom
      - teaching
      - generosity
      - expansion
      - dharma
      - higher learning
      - guidance

    description: |
      Jupiter Dasha rewards genuine wisdom-sharing and selfless generosity.
      Ego inflation is heavily penalized. Teaching without ego attachment
      is the highest form of karma clearing in this period.

    category_multipliers:
      service: 1.3
      responsibility: 1.0
      restraint: 0.8
      growth: 1.5
      generosity: 1.5

    penalty_multipliers:
      avoidance: 1.2
      inflation: 2.0  # Jupiter strongly penalizes ego
      harm: 1.8

    opportunities:
      - action_type: teaching
        description: Share knowledge without ego attachment
        potential_delta: -1.5
        dasha_alignment: high
        example: Mentor someone in your field without seeking credit

      - action_type: generosity
        description: Give resources or time anonymously
        potential_delta: -1.4
        dasha_alignment: high
        example: Donate to a cause without public acknowledgment

      - action_type: growth
        description: Deepen understanding through study and practice
        potential_delta: -1.2
        dasha_alignment: high
        example: Complete a course or master a skill that serves others

      - action_type: service
        description: Offer guidance to someone in need
        potential_delta: -1.3
        dasha_alignment: high
        example: Counsel a friend through a difficult decision without pushing your agenda

    warnings:
      - Taking credit for others' work or ideas
      - Preaching without practicing
      - Using knowledge as a power play
      - Ego inflation and self-aggrandizement
      - Overconfidence in your own righteousness

  # ===================
  # MARS (Mangal)
  # ===================
  Mars:
    themes:
      - courage
      - action
      - protection
      - decisiveness
      - energy
      - competition
      - strength

    description: |
      Mars Dasha rewards decisive action and protective courage.
      Restraint is less valued; healthy assertiveness burns karma.
      Anger and aggression add karmic debt.

    category_multipliers:
      service: 1.0
      responsibility: 1.3
      restraint: 0.7  # Mars doesn't reward passivity
      growth: 1.0
      generosity: 0.9

    penalty_multipliers:
      avoidance: 1.5
      inflation: 1.2
      harm: 2.5  # Mars heavily penalizes violence/anger

    opportunities:
      - action_type: responsibility
        description: Take decisive action on something you've been delaying
        potential_delta: -1.4
        dasha_alignment: high
        example: Start that business, make that career move, end that toxic situation

      - action_type: service
        description: Protect or defend someone who cannot protect themselves
        potential_delta: -1.6
        dasha_alignment: high
        example: Stand up for a colleague being treated unfairly

      - action_type: growth
        description: Channel energy into physical discipline
        potential_delta: -1.0
        dasha_alignment: medium
        example: Commit to a fitness routine or martial art

      - action_type: responsibility
        description: Confront a difficult situation directly
        potential_delta: -1.3
        dasha_alignment: high
        example: Address conflict head-on rather than avoiding it

    warnings:
      - Explosive anger or aggression
      - Using strength to dominate others
      - Impulsive decisions without consideration
      - Physical violence or intimidation
      - Reckless behavior that harms yourself or others

  # ===================
  # VENUS (Shukra)
  # ===================
  Venus:
    themes:
      - harmony
      - beauty
      - relationships
      - pleasure
      - creativity
      - diplomacy
      - love

    description: |
      Venus Dasha rewards creating harmony and genuine connection.
      Generous acts of love and creativity burn karma effectively.
      Excessive indulgence or manipulation add debt.

    category_multipliers:
      service: 1.0
      responsibility: 1.0
      restraint: 1.0
      growth: 1.2
      generosity: 1.3

    penalty_multipliers:
      avoidance: 1.2
      inflation: 1.5
      harm: 1.8

    opportunities:
      - action_type: generosity
        description: Create something beautiful for others' enjoyment
        potential_delta: -1.2
        dasha_alignment: high
        example: Cook a meal for friends, create art, or beautify a shared space

      - action_type: service
        description: Facilitate harmony in a conflicted relationship
        potential_delta: -1.4
        dasha_alignment: high
        example: Help mediate a dispute without taking sides

      - action_type: growth
        description: Develop a creative skill
        potential_delta: -1.0
        dasha_alignment: medium
        example: Learn music, art, or design

      - action_type: generosity
        description: Express genuine appreciation to others
        potential_delta: -0.8
        dasha_alignment: medium
        example: Write heartfelt thank-you notes or give sincere compliments

    warnings:
      - Excessive indulgence in sensory pleasures
      - Using charm for manipulation
      - Superficiality over substance
      - Jealousy or possessiveness
      - Neglecting responsibilities for pleasure

  # ===================
  # MERCURY (Budha)
  # ===================
  Mercury:
    themes:
      - communication
      - intellect
      - learning
      - adaptability
      - commerce
      - skill
      - analysis

    description: |
      Mercury Dasha rewards clear communication and skill development.
      Using intelligence to help others burns karma effectively.
      Deception and manipulation are heavily penalized.

    category_multipliers:
      service: 1.1
      responsibility: 1.0
      restraint: 1.0
      growth: 1.4
      generosity: 1.0

    penalty_multipliers:
      avoidance: 1.2
      inflation: 1.5
      harm: 2.0  # Deception is Mercury's shadow

    opportunities:
      - action_type: teaching
        description: Explain something complex simply
        potential_delta: -1.2
        dasha_alignment: high
        example: Help someone understand a difficult concept

      - action_type: growth
        description: Learn a new skill that serves your purpose
        potential_delta: -1.0
        dasha_alignment: high
        example: Take a course, learn a language, or master a tool

      - action_type: service
        description: Use communication skills to help others
        potential_delta: -1.3
        dasha_alignment: high
        example: Write a recommendation, explain medical results, or translate

      - action_type: responsibility
        description: Organize chaos into clarity
        potential_delta: -1.1
        dasha_alignment: medium
        example: Create systems that help others work more effectively

    warnings:
      - Deception or misleading communication
      - Using intelligence to manipulate
      - Overthinking without action
      - Gossip or spreading misinformation
      - Intellectual arrogance

  # ===================
  # MOON (Chandra)
  # ===================
  Moon:
    themes:
      - nurturing
      - emotions
      - intuition
      - receptivity
      - care
      - home
      - security

    description: |
      Moon Dasha rewards emotional attunement and genuine care.
      Nurturing without attachment burns karma effectively.
      Emotional manipulation adds significant debt.

    category_multipliers:
      service: 1.3
      responsibility: 1.0
      restraint: 1.2
      growth: 1.0
      generosity: 1.2

    penalty_multipliers:
      avoidance: 1.3
      inflation: 1.4
      harm: 2.0

    opportunities:
      - action_type: service
        description: Offer emotional support without trying to fix
        potential_delta: -1.3
        dasha_alignment: high
        example: Listen deeply to someone who's struggling without giving advice

      - action_type: generosity
        description: Create a nurturing environment for others
        potential_delta: -1.2
        dasha_alignment: high
        example: Prepare comfort food, create a welcoming space, or offer sanctuary

      - action_type: restraint
        description: Process emotions without projecting onto others
        potential_delta: -1.0
        dasha_alignment: high
        example: Feel your feelings fully without acting out

      - action_type: responsibility
        description: Care for those who depend on you
        potential_delta: -1.4
        dasha_alignment: high
        example: Be present for children, pets, or vulnerable family members

    warnings:
      - Emotional manipulation or guilt-tripping
      - Using others' emotions against them
      - Emotional unavailability when needed
      - Mood swings that harm relationships
      - Smothering or controlling through "care"

  # ===================
  # SUN (Surya)
  # ===================
  Sun:
    themes:
      - authority
      - leadership
      - vitality
      - purpose
      - identity
      - recognition
      - dharma

    description: |
      Sun Dasha rewards authentic leadership and stepping into purpose.
      Leading by example burns karma; ego-driven authority adds debt.

    category_multipliers:
      service: 1.0
      responsibility: 1.4
      restraint: 0.9
      growth: 1.2
      generosity: 1.0

    penalty_multipliers:
      avoidance: 1.5
      inflation: 2.0  # Sun penalizes false pride
      harm: 1.8

    opportunities:
      - action_type: responsibility
        description: Step into a leadership role that serves others
        potential_delta: -1.5
        dasha_alignment: high
        example: Take ownership of a project or initiative that needs direction

      - action_type: teaching
        description: Lead by example without seeking recognition
        potential_delta: -1.3
        dasha_alignment: high
        example: Model the behavior you want to see in others

      - action_type: growth
        description: Develop your unique purpose and gifts
        potential_delta: -1.1
        dasha_alignment: high
        example: Invest in developing your core strengths

      - action_type: service
        description: Use your authority to uplift others
        potential_delta: -1.4
        dasha_alignment: high
        example: Advocate for someone who lacks voice or power

    warnings:
      - Seeking recognition at others' expense
      - Authoritarian behavior
      - False pride and arrogance
      - Taking credit for collective work
      - Burning out from ego-driven overwork

  # ===================
  # RAHU (North Node)
  # ===================
  Rahu:
    themes:
      - ambition
      - desire
      - innovation
      - breaking boundaries
      - unconventional paths
      - obsession
      - illusion

    description: |
      Rahu Dasha rewards breaking free from limiting patterns.
      Authentic innovation burns karma; obsessive grasping adds debt.
      This is a period where old karmas surface for clearing.

    category_multipliers:
      service: 0.9
      responsibility: 1.0
      restraint: 1.3  # Restraint from obsession is rewarded
      growth: 1.3
      generosity: 1.0

    penalty_multipliers:
      avoidance: 1.3
      inflation: 1.8
      harm: 2.0

    opportunities:
      - action_type: growth
        description: Break free from a limiting pattern
        potential_delta: -1.4
        dasha_alignment: high
        example: Release an addiction, fear, or outdated identity

      - action_type: restraint
        description: Resist obsessive grasping
        potential_delta: -1.5
        dasha_alignment: high
        example: Let go of something you're holding too tightly

      - action_type: responsibility
        description: Face a shadow aspect you've been avoiding
        potential_delta: -1.6
        dasha_alignment: high
        example: Acknowledge and work on a personal blind spot

      - action_type: service
        description: Help others see through illusions
        potential_delta: -1.2
        dasha_alignment: medium
        example: Gently help someone recognize self-deception

    warnings:
      - Obsessive pursuit of desires
      - Deception (of self or others)
      - Shortcuts that bypass integrity
      - Chasing illusions of success
      - Manipulation for personal gain

  # ===================
  # KETU (South Node)
  # ===================
  Ketu:
    themes:
      - detachment
      - spirituality
      - release
      - past karma
      - surrender
      - isolation
      - liberation

    description: |
      Ketu Dasha rewards genuine detachment and spiritual surrender.
      Releasing attachment burns karma efficiently.
      Spiritual bypassing or false detachment adds debt.

    category_multipliers:
      service: 1.2
      responsibility: 0.9
      restraint: 1.5  # Ketu strongly rewards non-attachment
      growth: 1.3
      generosity: 1.2

    penalty_multipliers:
      avoidance: 1.8  # Spiritual bypass is avoidance
      inflation: 1.5
      harm: 1.5

    opportunities:
      - action_type: restraint
        description: Release attachment to an outcome
        potential_delta: -1.6
        dasha_alignment: high
        example: Do your best and genuinely accept whatever happens

      - action_type: growth
        description: Embrace a spiritual practice
        potential_delta: -1.2
        dasha_alignment: high
        example: Meditation, contemplation, or selfless service

      - action_type: service
        description: Help without needing thanks or recognition
        potential_delta: -1.4
        dasha_alignment: high
        example: Anonymous giving or silent service

      - action_type: generosity
        description: Give away something you're attached to
        potential_delta: -1.5
        dasha_alignment: high
        example: Donate possessions, release relationships that have run their course

    warnings:
      - Spiritual bypassing (using spirituality to avoid reality)
      - False detachment that's actually suppression
      - Isolation used to avoid responsibility
      - Nihilism or giving up prematurely
      - Using "non-attachment" to justify neglect
```

### 3. Validation Schema

```json
// backend/src/almamesh/karma/config/schema.json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Dasha Modifiers Configuration",
  "type": "object",
  "required": ["version", "defaults", "dashas"],
  "properties": {
    "version": {
      "type": "string",
      "pattern": "^[0-9]+\\.[0-9]+$"
    },
    "updated": {
      "type": "string",
      "format": "date"
    },
    "defaults": {
      "$ref": "#/definitions/dashaConfig"
    },
    "dashas": {
      "type": "object",
      "additionalProperties": {
        "$ref": "#/definitions/dashaConfig"
      },
      "propertyNames": {
        "enum": ["Saturn", "Jupiter", "Mars", "Venus", "Mercury", "Moon", "Sun", "Rahu", "Ketu"]
      }
    }
  },
  "definitions": {
    "dashaConfig": {
      "type": "object",
      "properties": {
        "themes": {
          "type": "array",
          "items": { "type": "string" },
          "minItems": 1
        },
        "description": { "type": "string" },
        "category_multipliers": {
          "type": "object",
          "properties": {
            "service": { "type": "number", "minimum": 0.5, "maximum": 2.0 },
            "responsibility": { "type": "number", "minimum": 0.5, "maximum": 2.0 },
            "restraint": { "type": "number", "minimum": 0.5, "maximum": 2.0 },
            "growth": { "type": "number", "minimum": 0.5, "maximum": 2.0 },
            "generosity": { "type": "number", "minimum": 0.5, "maximum": 2.0 }
          }
        },
        "penalty_multipliers": {
          "type": "object",
          "properties": {
            "avoidance": { "type": "number", "minimum": 1.0, "maximum": 3.0 },
            "inflation": { "type": "number", "minimum": 1.0, "maximum": 3.0 },
            "harm": { "type": "number", "minimum": 1.0, "maximum": 3.0 }
          }
        },
        "opportunities": {
          "type": "array",
          "items": {
            "$ref": "#/definitions/opportunity"
          }
        },
        "warnings": {
          "type": "array",
          "items": { "type": "string" }
        }
      }
    },
    "opportunity": {
      "type": "object",
      "required": ["action_type", "description", "potential_delta", "dasha_alignment", "example"],
      "properties": {
        "action_type": {
          "type": "string",
          "enum": ["service", "responsibility", "restraint", "growth", "generosity", "teaching"]
        },
        "description": { "type": "string", "minLength": 10 },
        "potential_delta": { "type": "number", "minimum": -5.0, "maximum": 0 },
        "dasha_alignment": {
          "type": "string",
          "enum": ["high", "medium", "low"]
        },
        "example": { "type": "string", "minLength": 10 }
      }
    }
  }
}
```

### 4. Config Loader

```python
# backend/src/almamesh/karma/config_loader.py

"""
YAML configuration loader for Dasha modifiers.

Loads, validates, and caches Dasha modifier configuration.
"""

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml
from jsonschema import ValidationError, validate
from pydantic import BaseModel, Field

# Config directory
CONFIG_DIR = Path(__file__).parent / "config"


class OpportunityConfig(BaseModel):
    """Configuration for a single opportunity."""
    action_type: str
    description: str
    potential_delta: float = Field(le=0)  # Must be negative (burning karma)
    dasha_alignment: str
    example: str


class DashaConfig(BaseModel):
    """Configuration for a single Dasha."""
    themes: list[str] = Field(default_factory=list)
    description: str = ""
    category_multipliers: dict[str, float] = Field(default_factory=dict)
    penalty_multipliers: dict[str, float] = Field(default_factory=dict)
    opportunities: list[OpportunityConfig] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class DashaModifiersConfig(BaseModel):
    """Root configuration for all Dasha modifiers."""
    version: str
    updated: str | None = None
    defaults: DashaConfig
    dashas: dict[str, DashaConfig]


@lru_cache(maxsize=1)
def load_dasha_config() -> DashaModifiersConfig:
    """
    Load and validate Dasha modifier configuration.

    Returns cached config on subsequent calls.
    Raises ValueError if config is invalid.
    """
    config_path = CONFIG_DIR / "dasha_modifiers.yaml"
    schema_path = CONFIG_DIR / "schema.json"

    if not config_path.exists():
        raise FileNotFoundError(f"Config not found: {config_path}")

    # Load YAML
    with open(config_path) as f:
        raw_config = yaml.safe_load(f)

    # Validate against JSON Schema (if schema exists)
    if schema_path.exists():
        with open(schema_path) as f:
            schema = json.load(f)
        try:
            validate(instance=raw_config, schema=schema)
        except ValidationError as e:
            raise ValueError(f"Config validation failed: {e.message}")

    # Parse into Pydantic model
    return DashaModifiersConfig(**raw_config)


def get_dasha_modifiers(dasha_lord: str) -> DashaConfig:
    """
    Get modifiers for a specific Dasha lord.

    Falls back to defaults if Dasha not found.
    """
    config = load_dasha_config()
    return config.dashas.get(dasha_lord, config.defaults)


def get_category_multiplier(dasha_lord: str, category: str) -> float:
    """Get multiplier for a category in a specific Dasha."""
    dasha_config = get_dasha_modifiers(dasha_lord)

    # Check category multipliers
    if category in ["service", "responsibility", "restraint", "growth", "generosity"]:
        return dasha_config.category_multipliers.get(category, 1.0)

    # Check penalty multipliers
    if category in ["avoidance", "inflation", "harm"]:
        return dasha_config.penalty_multipliers.get(category, 1.0)

    return 1.0


def get_dasha_themes(dasha_lord: str) -> list[str]:
    """Get themes for a specific Dasha."""
    return get_dasha_modifiers(dasha_lord).themes


def get_dasha_opportunities(dasha_lord: str) -> list[OpportunityConfig]:
    """Get opportunities for a specific Dasha."""
    return get_dasha_modifiers(dasha_lord).opportunities


def get_dasha_warnings(dasha_lord: str) -> list[str]:
    """Get warnings for a specific Dasha."""
    return get_dasha_modifiers(dasha_lord).warnings


def reload_config() -> None:
    """Force reload of configuration (clears cache)."""
    load_dasha_config.cache_clear()
```

### 5. Integration with Classification

```python
# backend/src/almamesh/karma/classification.py (updated)

from almamesh.karma.config_loader import (
    get_category_multiplier,
    get_dasha_themes,
)

def calculate_karma_delta(
    classification: ActionClassification,
    dasha_lord: str,
) -> float:
    """
    Calculate final karma delta with Dasha modifiers from config.
    """
    # Get multiplier from YAML config
    multiplier = get_category_multiplier(dasha_lord, classification.category.value)

    # Apply authenticity dampening
    authenticity_factor = {
        AuthenticitySignal.GENUINE: 1.0,
        AuthenticitySignal.PERFORMATIVE: 0.3,
        AuthenticitySignal.INFLATED: 0.5,
        AuthenticitySignal.DEFLECTED: 0.7,
        AuthenticitySignal.VICTIM_FRAMING: 0.4,
    }.get(classification.authenticity, 0.5)

    # For negative actions, authenticity doesn't reduce penalty
    if classification.base_delta > 0:
        final_delta = classification.base_delta * multiplier
    else:
        final_delta = classification.base_delta * multiplier * authenticity_factor

    # Apply Dasha alignment bonus
    alignment_modifier = 1 + (classification.dasha_alignment * 0.2)
    final_delta *= alignment_modifier

    return round(final_delta, 2)
```

---

## Files to Create

| File | Description |
|------|-------------|
| `karma/config/dasha_modifiers.yaml` | Main configuration file |
| `karma/config/schema.json` | JSON Schema for validation |
| `karma/config_loader.py` | Load and cache configuration |
| `tests/karma/test_config_loader.py` | Config loader tests |

---

## Implementation Phases

### Phase 1: Basic Config
- Create YAML with Saturn, Jupiter, Mars
- Implement config_loader.py
- Unit tests
- Test: `load_dasha_config()` returns valid data

### Phase 2: Full Coverage
- Add remaining 6 Dashas
- JSON Schema validation
- Test: All Dashas load correctly

### Phase 3: Integration
- Update classification.py to use config
- Update API to use config for opportunities
- Test: End-to-end flow with config

### Phase 4: Documentation
- Add inline comments to YAML
- Create README for config editing
- Test: Non-developer can understand and edit config

---

## Success Criteria

1. All 9 Mahadasha lords have complete configurations
2. Config loads in < 10ms (cached)
3. Invalid YAML fails validation with clear error
4. Changing YAML changes classification behavior
5. No hardcoded multipliers in Python code

---

## Editing Guidelines (For Domain Experts)

### Multiplier Ranges

| Multiplier | Range | Meaning |
|------------|-------|---------|
| 0.5-0.8 | Low | This Dasha doesn't emphasize this category |
| 0.9-1.1 | Neutral | Normal weight |
| 1.2-1.5 | High | This Dasha emphasizes this category |
| 1.5-2.0 | Very High | Strong Dasha alignment |

### Penalty Ranges

| Multiplier | Range | Meaning |
|------------|-------|---------|
| 1.0-1.2 | Mild | Minor penalty |
| 1.3-1.5 | Moderate | Noticeable penalty |
| 1.5-2.0 | Severe | Strong penalty |
| 2.0-3.0 | Extreme | Major karmic debt |

### Writing Opportunities

- **description**: Clear action, not vague
- **potential_delta**: Always negative (-0.5 to -2.0 typical)
- **example**: Concrete, relatable scenario
- **dasha_alignment**: high/medium/low based on thematic fit

### Writing Warnings

- Be specific about the behavior
- Focus on the shadow expression of the Dasha
- Avoid judgment - describe the pattern

---

## Quality Validation

### Required Agent Checks

Before merging any implementation, run these agent validations:

**Backend Code Quality (`code-quality-backend` agent):**
```bash
# Run via Claude Code Task tool with subagent_type=code-quality-backend
# Validates: ruff formatting, ruff linting, mypy type checking, pytest
```

Validation checklist:
- [ ] `ruff format --check backend/src/almamesh/karma/config_loader.py`
- [ ] `ruff check backend/src/almamesh/karma/config_loader.py`
- [ ] `mypy backend/src/almamesh/karma/config_loader.py`
- [ ] `pytest backend/tests/karma/test_config_loader.py -v`

**YAML Validation:**
- [ ] YAML syntax valid (`python -c "import yaml; yaml.safe_load(open('...'))"`)
- [ ] JSON Schema validation passes
- [ ] All 9 Dashas have complete configurations
- [ ] All multipliers within valid ranges

**Architecture Review (`architecture-advisor` agent):**
- Review configuration loading patterns
- Validate caching strategy
- Check for configuration drift risks

**Documentation Sync (`docs-sync-agent`):**
- Ensure YAML comments are accurate
- Verify editing guidelines match schema constraints
- Check that examples are valid per schema

### Configuration Testing

```python
# Required test coverage for config_loader.py

def test_load_all_dashas():
    """All 9 Dashas load without error."""
    config = load_dasha_config()
    assert len(config.dashas) == 9
    for dasha in ["Saturn", "Jupiter", "Mars", "Venus", "Mercury", "Moon", "Sun", "Rahu", "Ketu"]:
        assert dasha in config.dashas

def test_multiplier_ranges():
    """All multipliers within valid ranges."""
    config = load_dasha_config()
    for dasha_name, dasha in config.dashas.items():
        for cat, mult in dasha.category_multipliers.items():
            assert 0.5 <= mult <= 2.0, f"{dasha_name}.{cat} = {mult}"
        for cat, mult in dasha.penalty_multipliers.items():
            assert 1.0 <= mult <= 3.0, f"{dasha_name}.{cat} = {mult}"

def test_opportunities_have_negative_delta():
    """All opportunities burn karma (negative delta)."""
    config = load_dasha_config()
    for dasha_name, dasha in config.dashas.items():
        for opp in dasha.opportunities:
            assert opp.potential_delta < 0, f"{dasha_name}: {opp.action_type}"

def test_cache_performance():
    """Config loads fast on cache hit."""
    import time
    load_dasha_config.cache_clear()
    load_dasha_config()  # Cold load
    start = time.time()
    load_dasha_config()  # Cached
    elapsed = time.time() - start
    assert elapsed < 0.001  # < 1ms on cache hit
```

### Security Checklist

- [ ] YAML loaded with `safe_load` (not `load`)
- [ ] No code execution in config
- [ ] File paths validated
- [ ] Config file has appropriate permissions

---

## References

- **Template**: [SPEC-TEMPLATE.md](./SPEC-TEMPLATE.md) - Quality validation requirements
- Spec 054: Action Classification (uses multipliers)
- Spec 056: API Endpoints (serves opportunities)
- Traditional Jyotish texts on Dasha effects
