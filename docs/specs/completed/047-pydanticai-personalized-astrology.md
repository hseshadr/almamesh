# Spec 047: PydanticAI + Agent Lightning for Personalized Astrology

**Status**: Completed
**Priority**: P1 HIGH
**Completed**: 2026-01-20
**Result**: Structured interpretation, preferences, personalization added
**Created**: 2026-01-14
**Dependencies**: Spec 046 (Radical Simplification)

---

## Overview

Migrate from LiteLLM to PydanticAI for structured agent interactions, and integrate Microsoft's Agent Lightning framework for reinforcement learning. This enables:

1. **Type-safe LLM outputs** - Pydantic models for interpretations
2. **Personalized predictions** - RL-trained model adapts to user feedback
3. **Improved accuracy** - Learn from prediction outcomes over time

---

## Problem Statement

Current LLM integration (`llm.py`) has limitations:

1. **Unstructured outputs** - Raw text streaming, no validation
2. **Static prompts** - Same interpretation for everyone
3. **No learning** - Doesn't improve from user feedback or outcomes
4. **No personalization** - Generic readings regardless of user history

---

## Solution Architecture

### Component Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    AlmaMesh Backend                         │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────┐ │
│  │ PydanticAI  │───▶│   Agent     │───▶│ Agent Lightning │ │
│  │   Agent     │    │  Response   │    │   RL Training   │ │
│  └─────────────┘    └─────────────┘    └─────────────────┘ │
│         │                                      ▲            │
│         ▼                                      │            │
│  ┌─────────────┐                      ┌───────┴─────────┐  │
│  │  Structured │                      │ User Feedback   │  │
│  │   Output    │                      │ & Outcomes      │  │
│  │  (Pydantic) │                      │ Collection      │  │
│  └─────────────┘                      └─────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 1. PydanticAI Agent Definition

Replace raw LLM calls with a typed PydanticAI agent:

```python
from pydantic import BaseModel, Field
from pydantic_ai import Agent, RunContext

# Structured output models
class PlanetaryInsight(BaseModel):
    planet: str
    sign: str
    house: int
    interpretation: str
    strength: float = Field(ge=0, le=1, description="Confidence 0-1")

class DashaPrediction(BaseModel):
    period: str
    themes: list[str]
    opportunities: list[str]
    challenges: list[str]
    timing_advice: str

class ChartInterpretation(BaseModel):
    """Structured interpretation of a birth chart."""
    summary: str = Field(description="2-3 sentence overview")
    ascendant_analysis: str
    moon_analysis: str
    planetary_insights: list[PlanetaryInsight]
    current_dasha: DashaPrediction
    personalized_guidance: str = Field(description="Tailored advice based on user context")

# Agent with dependencies (chart context)
class ChartDependencies(BaseModel):
    chart_context: dict  # Sanitized SiderealContext
    user_preferences: dict | None = None
    interaction_history: list[str] | None = None

astrology_agent = Agent(
    "openai:gpt-4o",
    deps_type=ChartDependencies,
    output_type=ChartInterpretation,
    system_prompt="""You are an expert Vedic Astrologer with 30 years of experience.
    Provide accurate, empathetic readings based on the Sidereal Zodiac (Lahiri Ayanamsa).
    Use ONLY the astronomical data provided - never fabricate positions.
    Personalize guidance based on user's interaction history when available.""",
)

@astrology_agent.system_prompt
async def add_chart_context(ctx: RunContext[ChartDependencies]) -> str:
    """Dynamically inject chart context into system prompt."""
    import json
    return f"\n\nChart Data:\n{json.dumps(ctx.deps.chart_context, indent=2)}"
```

### 2. Agent Lightning Integration

Integrate [Microsoft Agent Lightning](https://github.com/microsoft/agent-lightning) for RL training:

```python
from agent_lightning import LightningClient, Feedback

# Initialize Lightning client (connects to training server)
lightning_client = LightningClient(
    server_url="http://localhost:8080",  # Lightning Server
    agent_id="almamesh-astrology-agent",
)

# Wrap agent execution with Lightning
async def generate_interpretation_with_rl(
    context: SiderealContext,
    user_id: str,
) -> ChartInterpretation:
    """Generate interpretation with RL feedback collection."""

    deps = ChartDependencies(
        chart_context=_sanitize_context_for_llm(context),
        user_preferences=await get_user_preferences(user_id),
        interaction_history=await get_recent_interactions(user_id),
    )

    # Execute agent through Lightning wrapper
    with lightning_client.trace(user_id=user_id) as trace:
        result = await astrology_agent.run(
            "Provide a complete interpretation of this birth chart.",
            deps=deps,
        )
        trace.record_output(result.output)

    return result.output


async def record_feedback(
    trace_id: str,
    rating: int,  # 1-5 stars
    feedback_text: str | None = None,
) -> None:
    """Record user feedback for RL training."""
    await lightning_client.submit_feedback(
        trace_id=trace_id,
        feedback=Feedback(
            rating=rating,
            text=feedback_text,
            timestamp=datetime.now(UTC),
        ),
    )
```

### 3. Feedback Collection System

Store feedback for RL training:

```python
# New database model for feedback
class InterpretationFeedback(Base):
    __tablename__ = "interpretation_feedback"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(255), ForeignKey("users.clerk_id"))
    chart_id: Mapped[str] = mapped_column(String(36), ForeignKey("charts.id"))
    trace_id: Mapped[str] = mapped_column(String(255))  # Agent Lightning trace
    rating: Mapped[int] = mapped_column(Integer)  # 1-5
    feedback_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    interpretation_type: Mapped[str] = mapped_column(String(50))  # "full" | "qa" | "dasha"
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

# Outcome tracking for long-term learning
class PredictionOutcome(Base):
    __tablename__ = "prediction_outcomes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(255), ForeignKey("users.clerk_id"))
    prediction_id: Mapped[str] = mapped_column(String(36))
    prediction_text: Mapped[str] = mapped_column(Text)
    predicted_timeframe: Mapped[str] = mapped_column(String(100))
    outcome_reported: Mapped[bool] = mapped_column(Boolean, default=False)
    outcome_accuracy: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 1-5
    outcome_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    outcome_reported_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
```

### 4. Personalization Pipeline

```python
async def get_user_preferences(user_id: str) -> dict:
    """Get user preferences for personalized interpretations."""
    # Fetch from database
    prefs = await db.get_user_preferences(user_id)
    return {
        "preferred_topics": prefs.topics,  # ["career", "relationships", "health"]
        "communication_style": prefs.style,  # "detailed" | "concise" | "spiritual"
        "experience_level": prefs.level,  # "beginner" | "intermediate" | "advanced"
    }

async def get_recent_interactions(user_id: str, limit: int = 10) -> list[str]:
    """Get recent Q&A history for context."""
    messages = await db.get_recent_chat_messages(user_id, limit=limit)
    return [msg.content for msg in messages]
```

---

## API Changes

### New Endpoints

```python
# Feedback endpoint
@app.post("/api/v1/interpretations/{interpretation_id}/feedback")
async def submit_feedback(
    interpretation_id: str,
    feedback: FeedbackRequest,
    user: CurrentUser = Depends(),
) -> FeedbackResponse:
    """Submit user feedback for an interpretation."""
    pass

# Outcome tracking endpoint
@app.post("/api/v1/predictions/{prediction_id}/outcome")
async def report_outcome(
    prediction_id: str,
    outcome: OutcomeRequest,
    user: CurrentUser = Depends(),
) -> OutcomeResponse:
    """Report actual outcome of a prediction."""
    pass

# User preferences endpoint
@app.put("/api/v1/users/preferences")
async def update_preferences(
    preferences: PreferencesRequest,
    user: CurrentUser = Depends(),
) -> PreferencesResponse:
    """Update user interpretation preferences."""
    pass
```

### Modified Endpoints

```python
# Existing interpretation endpoint - now returns structured output
@app.post("/api/v1/charts/{chart_id}/interpret")
async def interpret_chart(
    chart_id: str,
    user: CurrentUser = Depends(),
) -> ChartInterpretation:  # Now returns structured Pydantic model
    """Generate AI interpretation with personalization."""
    pass
```

---

## Migration Plan

### Phase 1: PydanticAI Integration (Week 1)

1. Install PydanticAI: `uv add pydantic-ai`
2. Define output models (`ChartInterpretation`, `DashaPrediction`, etc.)
3. Create PydanticAI agent with streaming support
4. Migrate `generate_interpretation()` to use agent
5. Migrate `answer_question()` to use agent
6. Keep existing API contract (stream text for backwards compat)

### Phase 2: Structured Outputs (Week 2)

1. Add new API endpoints returning structured JSON
2. Update frontend to consume structured responses
3. Add client-side rendering of structured interpretations
4. Deprecate raw text streaming (keep for fallback)

### Phase 3: Feedback System (Week 3)

1. Add feedback database models
2. Implement feedback API endpoints
3. Add feedback UI in frontend (star rating + optional text)
4. Implement feedback collection in agent wrapper

### Phase 4: Agent Lightning Integration (Week 4)

1. Set up Agent Lightning server (Docker or cloud)
2. Install `agent-lightning` client
3. Wrap agent execution with Lightning tracing
4. Connect feedback to Lightning training pipeline
5. Configure RL training schedule

### Phase 5: Personalization (Week 5)

1. Add user preferences model and API
2. Implement preference-based prompt customization
3. Add interaction history context injection
4. Test personalization quality

---

## Dependencies

### Python Packages

```toml
[project.dependencies]
pydantic-ai = ">=0.0.49"
agent-lightning = ">=0.1.0"  # Microsoft Agent Lightning
```

### Infrastructure

- **Agent Lightning Server**: Docker container or cloud deployment
- **GPU (optional)**: For faster RL training iterations

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| User satisfaction (avg rating) | N/A | 4.0+ stars |
| Interpretation relevance | Generic | Personalized |
| Prediction accuracy (user-reported) | N/A | 70%+ accurate |
| Return user engagement | N/A | 40% return within week |

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Agent Lightning complexity | HIGH | Start with feedback collection only, add RL later |
| Training data scarcity | MEDIUM | Collect feedback for 2-4 weeks before training |
| Model drift | MEDIUM | A/B test trained vs base model |
| Latency increase | LOW | Cache personalization context, async feedback |

---

## References

- [PydanticAI Documentation](https://ai.pydantic.dev/)
- [Microsoft Agent Lightning](https://github.com/microsoft/agent-lightning)
- [Agent Lightning Paper](https://arxiv.org/abs/2508.03680)
- [Agent Lightning Blog Post](https://www.microsoft.com/en-us/research/blog/agent-lightning-adding-reinforcement-learning-to-ai-agents-without-code-rewrites/)

---

## Checklist

- [x] Install PydanticAI
- [x] Define Pydantic output models
- [x] Create PydanticAI agent
- [x] Migrate interpretation function
- [x] Migrate Q&A function
- [x] Add structured output endpoints
- [x] Add feedback database models
- [x] Implement feedback API
- [x] Add feedback UI
- [x] Set up Agent Lightning server
- [x] Integrate Lightning client
- [x] Implement personalization
- [x] A/B test and validate
