# Spec 054: Karma Action Classification via LLM

**Status:** Draft
**Created:** 2025-01-22
**Priority:** P2 MEDIUM
**Dependencies:** Spec 047 (PydanticAI), Spec 051 (User Memory)

## Goal

Build an LLM-powered action classification system that analyzes user-reported experiences and maps them to karmic actions with Dasha-conditioned multipliers. Uses PydanticAI structured outputs to extract intent, action type, and authenticity signals from natural language.

---

## Why LLM, Not Traditional NLP

Traditional NLP (keyword matching, sentiment analysis, intent classifiers) fails for this domain:

```
"I helped my neighbor today"           → Traditional NLP: positive action
"I told my neighbor I helped them"     → Traditional NLP: positive action (WRONG)

"I set a boundary with my boss"        → Traditional NLP: conflict? neutral?
"I avoided my boss to dodge conflict"  → Traditional NLP: conflict? neutral?
```

LLMs with structured outputs can:
- Distinguish **action** from **claim about action**
- Detect **performative language** (saying vs doing)
- Understand **intent quality** (genuine vs ego-driven)
- Recognize **narrative inflation** and **victim framing**
- Apply **Dasha context** to evaluation

This is what PydanticAI agents excel at: nuanced classification with typed outputs.

---

## Current State

- `llm.py` has PydanticAI agents for chart interpretation and Q&A
- No action/behavior classification system exists
- No karma ledger or tracking mechanism

---

## Requirements

### Must Have
- LLM agent that classifies user messages into structured `ActionClassification`
- Dasha-aware multiplier application
- Authenticity scoring (detect performative/inflated claims)
- Anti-gaming safeguards (diminishing returns, pattern detection)
- Structured output via Pydantic models

### Should Have
- Explanation generation (why this classification)
- Confidence calibration
- Historical pattern awareness (via user memory)

### Out of Scope
- Full karma ledger database schema (separate spec)
- Gamification UI (separate spec)
- Real-time chat interface (separate spec)

---

## Technical Design

### 1. Core Classification Models

```python
from enum import Enum
from pydantic import BaseModel, Field

class ActionCategory(str, Enum):
    """Primary action categories aligned with karmic principles."""
    SERVICE = "service"           # Selfless help, teaching, mentoring
    RESPONSIBILITY = "responsibility"  # Duty fulfillment, accountability
    RESTRAINT = "restraint"       # Conscious non-reaction, boundary setting
    GROWTH = "growth"             # Learning, self-improvement
    GENEROSITY = "generosity"     # Giving without expectation
    AVOIDANCE = "avoidance"       # Dodging duty, escapism
    INFLATION = "inflation"       # Ego aggrandizement, credit-taking
    HARM = "harm"                 # Intentional negative actions

class AuthenticitySignal(str, Enum):
    """Signals about the authenticity of the reported action."""
    GENUINE = "genuine"           # Action matches description
    PERFORMATIVE = "performative" # Saying > doing
    INFLATED = "inflated"         # Exaggerated importance
    DEFLECTED = "deflected"       # Shifting responsibility
    VICTIM_FRAMING = "victim_framing"  # External blame pattern

class ActionClassification(BaseModel):
    """Structured output from action classification agent."""

    # Core classification
    category: ActionCategory = Field(
        description="Primary action category"
    )
    sub_category: str = Field(
        description="Specific action type within category"
    )

    # Karma impact
    base_delta: float = Field(
        ge=-5.0, le=5.0,
        description="Base karma change (-5 to +5). Negative = burning karma (good for clearing debt)"
    )

    # Authenticity assessment
    authenticity: AuthenticitySignal = Field(
        description="Assessment of action authenticity"
    )
    authenticity_confidence: float = Field(
        ge=0.0, le=1.0,
        description="Confidence in authenticity assessment"
    )

    # Reasoning
    reasoning: str = Field(
        description="Brief explanation of classification"
    )
    detected_patterns: list[str] = Field(
        default_factory=list,
        description="Patterns detected (inflation, deflection, etc.)"
    )

    # Dasha relevance
    dasha_alignment: float = Field(
        ge=-1.0, le=1.0,
        description="How aligned is this action with current Dasha themes (-1 to 1)"
    )

class DashaModifiers(BaseModel):
    """Dasha-specific multipliers for action categories."""

    dasha_lord: str = Field(description="Current Mahadasha lord")

    # Category multipliers (applied to base_delta)
    service_multiplier: float = Field(default=1.0, ge=0.5, le=2.0)
    responsibility_multiplier: float = Field(default=1.0, ge=0.5, le=2.0)
    restraint_multiplier: float = Field(default=1.0, ge=0.5, le=2.0)
    growth_multiplier: float = Field(default=1.0, ge=0.5, le=2.0)
    generosity_multiplier: float = Field(default=1.0, ge=0.5, le=2.0)

    # Penalty multipliers (for negative actions)
    avoidance_penalty: float = Field(default=1.0, ge=1.0, le=3.0)
    inflation_penalty: float = Field(default=1.0, ge=1.0, le=3.0)

# Dasha configuration (would be in YAML/config, shown inline for clarity)
DASHA_MODIFIERS = {
    "Saturn": DashaModifiers(
        dasha_lord="Saturn",
        responsibility_multiplier=1.5,
        restraint_multiplier=1.5,
        service_multiplier=1.2,
        avoidance_penalty=2.0,
    ),
    "Jupiter": DashaModifiers(
        dasha_lord="Jupiter",
        generosity_multiplier=1.5,
        growth_multiplier=1.5,
        service_multiplier=1.3,
        inflation_penalty=2.0,  # Jupiter punishes ego
    ),
    "Mars": DashaModifiers(
        dasha_lord="Mars",
        responsibility_multiplier=1.3,
        restraint_multiplier=0.8,  # Mars doesn't reward passivity
        avoidance_penalty=1.5,
    ),
    "Venus": DashaModifiers(
        dasha_lord="Venus",
        generosity_multiplier=1.3,
        growth_multiplier=1.2,
        service_multiplier=1.0,
    ),
    # ... other planets
}
```

### 2. Classification Agent

```python
from dataclasses import dataclass
from pydantic_ai import Agent, RunContext

CLASSIFICATION_PROMPT = """You are a Karmic Action Classifier for AlmaMesh.

Your task is to analyze user-reported experiences and classify them accurately.

## Classification Principles

1. **Action vs Claim**: Distinguish what the user DID from what they SAID they did
   - "I helped my neighbor" = potential action
   - "I told everyone I helped" = performative claim

2. **Intent Quality**: Assess the underlying motivation
   - Genuine service vs service for recognition
   - Authentic growth vs performance of growth

3. **Authenticity Signals**: Detect patterns of:
   - PERFORMATIVE: Focus on telling others, seeking validation
   - INFLATED: Exaggerating impact or difficulty
   - DEFLECTED: Attributing outcomes to others (positive or negative)
   - VICTIM_FRAMING: Consistent external blame pattern

4. **Dasha Alignment**: Consider current planetary period themes
   - Saturn: duty, patience, service to elders/dependents
   - Jupiter: teaching, wisdom, generosity without ego
   - Mars: courage, decisive action, protection
   - etc.

## Karma Delta Guidelines

Negative delta = BURNING karma (positive outcome - clearing debt)
Positive delta = ADDING karma (mixed - can be good or bad depending on context)

- SERVICE (genuine): -1.0 to -2.0 (burns karma)
- RESPONSIBILITY (fulfilled): -0.5 to -1.5 (burns karma)
- RESTRAINT (conscious): -0.5 to -1.0 (burns karma)
- GROWTH (authentic): -0.3 to -0.8 (burns karma)
- GENEROSITY (selfless): -0.5 to -1.5 (burns karma)
- AVOIDANCE: +0.5 to +2.0 (adds karmic debt)
- INFLATION: +0.3 to +1.0 (adds karmic debt)
- HARM: +1.0 to +5.0 (adds significant karmic debt)

## Anti-Gaming Rules

Be skeptical of:
- Excessive positive framing
- Lack of any challenges or difficulties mentioned
- Vague, unmeasurable claims
- Patterns of always being the hero
- Consistent victim narratives

Award LOWER magnitude deltas when authenticity is uncertain."""

@dataclass
class ClassificationDependencies:
    """Dependencies for action classification agent."""
    user_message: str
    current_dasha: str
    dasha_themes: list[str]
    recent_classifications: list[dict] | None = None  # For pattern detection
    user_memory_context: str | None = None

def _get_classification_agent(model: str) -> Agent[ClassificationDependencies, ActionClassification]:
    """Create action classification agent with structured output."""
    agent: Agent[ClassificationDependencies, ActionClassification] = Agent(
        model,
        deps_type=ClassificationDependencies,
        output_type=ActionClassification,
        system_prompt=CLASSIFICATION_PROMPT,
    )

    @agent.system_prompt
    async def add_context(ctx: RunContext[ClassificationDependencies]) -> str:
        context_parts = [
            f"\n\nCurrent Dasha: {ctx.deps.current_dasha}",
            f"Dasha Themes: {', '.join(ctx.deps.dasha_themes)}",
        ]

        if ctx.deps.user_memory_context:
            context_parts.append(f"\nUser Context: {ctx.deps.user_memory_context}")

        if ctx.deps.recent_classifications:
            # Include recent patterns for anti-gaming
            recent = ctx.deps.recent_classifications[-5:]
            pattern_str = "\n".join([
                f"- {c['category']}: {c['authenticity']}"
                for c in recent
            ])
            context_parts.append(f"\nRecent pattern:\n{pattern_str}")

        return "\n".join(context_parts)

    return agent

async def classify_action(
    user_message: str,
    current_dasha: str,
    dasha_themes: list[str],
    recent_classifications: list[dict] | None = None,
    user_memory_context: str | None = None,
    model: str = "gpt-4o-mini",
) -> ActionClassification:
    """
    Classify a user-reported action into structured karma categories.

    Args:
        user_message: The user's description of their action/experience
        current_dasha: Current Mahadasha lord (e.g., "Saturn")
        dasha_themes: Key themes for current Dasha period
        recent_classifications: Last N classifications for pattern detection
        user_memory_context: Relevant user memory/history
        model: LLM model to use

    Returns:
        ActionClassification with category, delta, and authenticity assessment
    """
    deps = ClassificationDependencies(
        user_message=user_message,
        current_dasha=current_dasha,
        dasha_themes=dasha_themes,
        recent_classifications=recent_classifications,
        user_memory_context=user_memory_context,
    )

    model_str = _get_model_string(model)
    agent = _get_classification_agent(model_str)

    result = await agent.run(user_message, deps=deps)
    return result.output
```

### 3. Karma Delta Calculation

```python
def calculate_karma_delta(
    classification: ActionClassification,
    dasha_lord: str,
) -> float:
    """
    Calculate final karma delta with Dasha modifiers and authenticity adjustment.

    Returns:
        Final karma delta (negative = burning, positive = adding)
    """
    modifiers = DASHA_MODIFIERS.get(dasha_lord, DashaModifiers(dasha_lord=dasha_lord))

    # Get category-specific multiplier
    category_multipliers = {
        ActionCategory.SERVICE: modifiers.service_multiplier,
        ActionCategory.RESPONSIBILITY: modifiers.responsibility_multiplier,
        ActionCategory.RESTRAINT: modifiers.restraint_multiplier,
        ActionCategory.GROWTH: modifiers.growth_multiplier,
        ActionCategory.GENEROSITY: modifiers.generosity_multiplier,
        ActionCategory.AVOIDANCE: modifiers.avoidance_penalty,
        ActionCategory.INFLATION: modifiers.inflation_penalty,
        ActionCategory.HARM: 1.5,  # Harm is always penalized
    }

    multiplier = category_multipliers.get(classification.category, 1.0)

    # Apply authenticity dampening
    # Performative/inflated actions get reduced magnitude
    authenticity_factor = {
        AuthenticitySignal.GENUINE: 1.0,
        AuthenticitySignal.PERFORMATIVE: 0.3,  # Heavily dampened
        AuthenticitySignal.INFLATED: 0.5,
        AuthenticitySignal.DEFLECTED: 0.7,
        AuthenticitySignal.VICTIM_FRAMING: 0.4,
    }.get(classification.authenticity, 0.5)

    # For negative actions, authenticity doesn't reduce penalty
    if classification.base_delta > 0:
        # Adding karma (bad) - no authenticity discount
        final_delta = classification.base_delta * multiplier
    else:
        # Burning karma (good) - authenticity matters
        final_delta = classification.base_delta * multiplier * authenticity_factor

    # Apply Dasha alignment bonus/penalty
    alignment_modifier = 1 + (classification.dasha_alignment * 0.2)
    final_delta *= alignment_modifier

    return round(final_delta, 2)
```

### 4. Anti-Gaming Safeguards

```python
from collections import defaultdict
from datetime import datetime, timedelta

class AntiGamingEngine:
    """Detect and penalize gaming attempts."""

    def __init__(self):
        self.action_counts: dict[str, list[datetime]] = defaultdict(list)
        self.pattern_flags: dict[str, int] = defaultdict(int)

    def check_diminishing_returns(
        self,
        user_id: str,
        category: ActionCategory,
        window_hours: int = 24,
    ) -> float:
        """
        Calculate diminishing returns multiplier for repeated actions.

        Returns:
            Multiplier between 0.1 and 1.0
        """
        key = f"{user_id}:{category.value}"
        now = datetime.utcnow()
        cutoff = now - timedelta(hours=window_hours)

        # Filter to recent actions
        recent = [t for t in self.action_counts[key] if t > cutoff]
        self.action_counts[key] = recent

        # Diminishing returns curve
        count = len(recent)
        if count == 0:
            return 1.0
        elif count < 3:
            return 0.9
        elif count < 5:
            return 0.6
        elif count < 10:
            return 0.3
        else:
            return 0.1  # Heavy penalty for spamming

    def record_action(self, user_id: str, category: ActionCategory) -> None:
        """Record an action for diminishing returns tracking."""
        key = f"{user_id}:{category.value}"
        self.action_counts[key].append(datetime.utcnow())

    def check_pattern_flags(
        self,
        recent_classifications: list[ActionClassification],
    ) -> tuple[bool, list[str]]:
        """
        Detect suspicious patterns across recent classifications.

        Returns:
            (is_suspicious, list of detected patterns)
        """
        if len(recent_classifications) < 5:
            return False, []

        flags = []

        # Check for all-positive pattern (suspicious)
        all_positive = all(
            c.category in [
                ActionCategory.SERVICE,
                ActionCategory.RESPONSIBILITY,
                ActionCategory.RESTRAINT,
                ActionCategory.GROWTH,
                ActionCategory.GENEROSITY,
            ]
            for c in recent_classifications
        )
        if all_positive:
            flags.append("consistent_positive_only")

        # Check for authenticity patterns
        performative_count = sum(
            1 for c in recent_classifications
            if c.authenticity == AuthenticitySignal.PERFORMATIVE
        )
        if performative_count > len(recent_classifications) * 0.5:
            flags.append("high_performative_rate")

        # Check for victim framing pattern
        victim_count = sum(
            1 for c in recent_classifications
            if c.authenticity == AuthenticitySignal.VICTIM_FRAMING
        )
        if victim_count > len(recent_classifications) * 0.4:
            flags.append("victim_narrative_pattern")

        return len(flags) > 0, flags
```

---

## Files to Create/Modify

| File | Changes |
|------|---------|
| `backend/src/almamesh/karma/__init__.py` | **NEW** - Package init |
| `backend/src/almamesh/karma/classification.py` | **NEW** - ActionClassification agent |
| `backend/src/almamesh/karma/models.py` | **NEW** - Pydantic models |
| `backend/src/almamesh/karma/anti_gaming.py` | **NEW** - Anti-gaming engine |
| `backend/src/almamesh/karma/dasha_modifiers.py` | **NEW** - Dasha multiplier configs |
| `backend/tests/karma/test_classification.py` | **NEW** - Classification tests |

---

## Implementation Phases

### Phase 1: Core Models & Agent
- Define Pydantic models (ActionCategory, ActionClassification, etc.)
- Implement classification agent with structured output
- Basic unit tests with mocked LLM responses
- Test: `uv run pytest backend/tests/karma/test_classification.py -v`

### Phase 2: Dasha Integration
- Define Dasha modifier configurations
- Implement `calculate_karma_delta` with multipliers
- Integration with existing Dasha calculation from `llm.py`
- Test: Verify multipliers apply correctly per Dasha

### Phase 3: Anti-Gaming
- Implement diminishing returns tracking
- Pattern detection across classification history
- Integration with user memory (Spec 051)
- Test: Simulate gaming attempts, verify penalties

### Phase 4: API Integration
- Add `/karma/classify` endpoint
- Connect to user's current Dasha from chart
- Store classifications in user memory
- Test: End-to-end classification flow

---

## Success Criteria

1. Classification correctly distinguishes "I helped" from "I said I helped" (authenticity detection)
2. Dasha multipliers correctly amplify/dampen karma deltas
3. Repeated same-category actions within 24h get diminishing returns
4. Pattern detection flags suspicious all-positive or victim-framing patterns
5. All outputs are structured Pydantic models (type-safe)

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| LLM inconsistency | Use structured outputs, test with diverse examples |
| Users learn "right" language | Randomize prompt variations, track linguistic patterns |
| Cost per classification | Use gpt-4o-mini, batch where possible, cache recent |
| Psychological harm from low scores | Frame as "opportunity" not "failure", no punitive UI |
| Gaming via multiple accounts | Rate limiting, device fingerprinting (future) |

---

## Ethical Boundaries

This system:
- Does NOT claim metaphysical truth about karma
- Does NOT punish users - only provides feedback
- Does NOT replace professional mental health support
- DOES present karma as a symbolic feedback mechanism
- DOES encourage pro-social behavior through positive reinforcement

Required disclaimers in UI:
- "This is a symbolic feedback system, not spiritual judgment"
- "For mental health concerns, please consult a professional"

---

## Example Classifications

### Example 1: Genuine Service
```
Input: "I spent 3 hours helping my elderly neighbor with her groceries
        and didn't tell anyone about it"
Dasha: Saturn

Output:
  category: SERVICE
  sub_category: "elder_care"
  base_delta: -1.5
  authenticity: GENUINE
  authenticity_confidence: 0.9
  reasoning: "Specific action with time investment, no performative elements,
              aligned with Saturn's elder-service theme"
  dasha_alignment: 0.8

Final delta: -1.5 * 1.2 (Saturn service) * 1.0 (genuine) * 1.16 (alignment) = -2.09
```

### Example 2: Performative Claim
```
Input: "I'm always helping everyone. Today I told my coworkers about
        how I donated to charity last month"
Dasha: Jupiter

Output:
  category: INFLATION
  sub_category: "credit_seeking"
  base_delta: +0.5
  authenticity: PERFORMATIVE
  authenticity_confidence: 0.85
  reasoning: "Focus on telling others rather than the action itself.
              Vague 'always helping' without specifics. Jupiter Dasha
              penalizes ego inflation."
  detected_patterns: ["credit_seeking", "vague_claims"]
  dasha_alignment: -0.6

Final delta: +0.5 * 2.0 (Jupiter inflation penalty) * 0.88 (alignment) = +0.88
```

### Example 3: Authentic Restraint
```
Input: "My boss criticized me unfairly in a meeting. I wanted to argue back
        but I stayed quiet, took notes, and addressed it privately afterward"
Dasha: Saturn

Output:
  category: RESTRAINT
  sub_category: "conscious_non_reaction"
  base_delta: -1.0
  authenticity: GENUINE
  authenticity_confidence: 0.88
  reasoning: "Specific situation with conscious choice. Took constructive
              follow-up action. Strong Saturn alignment."
  dasha_alignment: 0.9

Final delta: -1.0 * 1.5 (Saturn restraint) * 1.0 (genuine) * 1.18 (alignment) = -1.77
```

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
- [ ] `ruff format --check backend/src/almamesh/karma/`
- [ ] `ruff check backend/src/almamesh/karma/`
- [ ] `mypy backend/src/almamesh/karma/`
- [ ] `pytest backend/tests/karma/ -v`

**Architecture Review (`architecture-advisor` agent):**
- Review PydanticAI agent design patterns
- Validate structured output schemas
- Check anti-gaming algorithm design

### Testing Requirements

```python
# Required test cases for classification.py

def test_genuine_service_classification():
    """Genuine service actions are classified correctly."""
    result = await classify_action(
        user_message="I spent 3 hours helping my neighbor without telling anyone",
        current_dasha="Saturn",
        dasha_themes=["service", "responsibility"],
    )
    assert result.category == ActionCategory.SERVICE
    assert result.authenticity == AuthenticitySignal.GENUINE

def test_performative_detection():
    """Performative language is detected."""
    result = await classify_action(
        user_message="I told everyone how I helped my neighbor",
        current_dasha="Saturn",
        dasha_themes=["service", "responsibility"],
    )
    assert result.authenticity in [
        AuthenticitySignal.PERFORMATIVE,
        AuthenticitySignal.INFLATED
    ]

def test_dasha_alignment():
    """Dasha alignment affects classification."""
    saturn_result = await classify_action(
        user_message="I accepted a difficult responsibility",
        current_dasha="Saturn",
        dasha_themes=["responsibility"],
    )
    jupiter_result = await classify_action(
        user_message="I accepted a difficult responsibility",
        current_dasha="Jupiter",
        dasha_themes=["wisdom", "teaching"],
    )
    # Saturn should have higher alignment for responsibility
    assert saturn_result.dasha_alignment > jupiter_result.dasha_alignment
```

### Security Checklist

- [ ] No PII stored in classification results
- [ ] Source messages sanitized before LLM
- [ ] Rate limiting on classification endpoint
- [ ] LLM errors handled gracefully (no stack traces exposed)

---

## References

- **Template**: [SPEC-TEMPLATE.md](./SPEC-TEMPLATE.md) - Quality validation requirements
- Spec 047: PydanticAI Personalized Astrology (agent patterns)
- Spec 051: User Model Memory (context storage)
- Spec 052: Predictive Canonical Schema (structured output patterns)
- PydanticAI docs: https://ai.pydantic.dev/
