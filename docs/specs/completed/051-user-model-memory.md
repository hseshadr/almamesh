# Spec 051: User Model + Memory Architecture

**Status:** Draft
**Created:** 2026-01-17
**Priority:** P1 HIGH
**Dependencies:** Spec 050 (Composite Dasha Engine), Spec 047 (PydanticAI)

## Goal

Build a **structured User Model** and **memory system** that enables personalized predictions without replacing deterministic computation. The engine predicts; memory refines what predictions *mean* for this specific user.

---

## The Problem

Without user context, predictions are generic:

> "Career change window: Mar–Sep 2027, probability 0.78"

With user context, predictions become actionable:

> "You mentioned interviewing at startups and your visa renews in June. This career window aligns well — the switch you're considering has strong timing, but relocation to Austin may need to wait until Q4 when the 4th house pressure eases."

**Current State:**
- Spec 047 mentions `get_user_preferences()` but doesn't define the schema
- No structured storage for user context
- No memory promotion rules (casual mention vs confirmed fact)
- No feedback loop integration

---

## Architecture: 4 Distinct Memory Types

```
┌─────────────────────────────────────────────────────────────────┐
│                      UserMemory Architecture                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ 1. EPISODIC MEMORY (Vector DB)                              ││
│  │    "User mentioned hating their boss"                       ││
│  │    → Retrieval for chat context                             ││
│  │    → Append-only, never edited                              ││
│  └──────────────────────────┬──────────────────────────────────┘│
│                             │ promotion (confirmation/repetition)│
│                             ▼                                    │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ 2. SEMANTIC MEMORY (Structured Profile)                     ││
│  │    career_context.job_satisfaction = "dissatisfied"         ││
│  │    relationship_context.status = "dating"                   ││
│  │    → System-managed, promoted from episodic                 ││
│  │    → User can view but not directly edit                    ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ 3. PREFERENCE MEMORY (User-Controlled)                      ││
│  │    wants_probabilities: true                                ││
│  │    communication_style: "direct"                            ││
│  │    topics_to_avoid: ["health"]                              ││
│  │    → Fully user-editable via settings                       ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ 4. FEEDBACK MEMORY (Calibration Loop)                       ││
│  │    prediction_id: "xyz", outcome: "wrong_timing"            ││
│  │    → Append-only corrections to past predictions            ││
│  │    → Fed back to engine scoring + RL training               ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Memory Type Definitions

| Type | Storage | Mutability | Owner | Purpose |
|------|---------|------------|-------|---------|
| **Episodic** | Vector DB | Append-only | System | Raw chat snippets for retrieval |
| **Semantic** | Structured JSON | System-managed | System | Confirmed facts about user's life |
| **Preference** | Structured JSON | User-editable | User | How user wants predictions |
| **Feedback** | Structured + Vector | Append-only | User | Corrections to past predictions |

### Key Principle: Separation of Concerns

- **Episodic** = raw memory (what was said)
- **Semantic** = truth memory (what we know)
- **Preference** = style memory (how to communicate)
- **Feedback** = calibration memory (what was wrong)

---

## Domain Models

### UserModel (Core Schema)

```python
class CareerContext(BaseModel):
    """Structured career information for prediction refinement."""
    industry: str | None = None              # "tech", "finance", "healthcare"
    role_level: str | None = None            # "ic", "manager", "director", "exec"
    company_stage: str | None = None         # "startup", "growth", "enterprise"
    tenure_months: int | None = None         # How long at current job
    job_satisfaction: str | None = None      # "satisfied", "neutral", "dissatisfied"
    mobility_preference: str | None = None   # "promotion", "switch", "startup", "any"
    active_job_search: bool = False
    interview_stage: str | None = None       # "none", "applying", "interviewing", "offer"

    # Constraints
    visa_dependent: bool = False
    non_compete: bool = False
    golden_handcuffs: bool = False           # Stock vesting, bonuses holding them


class RelationshipContext(BaseModel):
    """Structured relationship information."""
    status: str | None = None                # "single", "dating", "engaged", "married"
    relationship_duration_months: int | None = None
    cohabiting: bool = False
    desire_for_commitment: str | None = None # "not_interested", "open", "actively_seeking"
    desire_for_children: str | None = None   # "no", "someday", "soon", "trying"
    partner_career_considerations: bool = False  # Dual-career constraints


class LocationContext(BaseModel):
    """Structured location/living situation."""
    current_city: str | None = None
    current_country: str | None = None
    owns_property: bool = False
    open_to_relocation: bool = True
    preferred_locations: list[str] = []
    blocked_locations: list[str] = []        # Visa, family, etc.
    remote_work_possible: bool = False


class HealthContext(BaseModel):
    """Health considerations (user-disclosed only)."""
    has_chronic_conditions: bool = False
    general_health_concern_level: str = "low"  # "low", "moderate", "high"
    # Never store specific conditions - just awareness level


class FinancialContext(BaseModel):
    """Financial situation awareness."""
    stability: str | None = None             # "stressed", "stable", "comfortable"
    major_expenses_upcoming: bool = False    # Wedding, house, education
    risk_tolerance: str = "moderate"         # "conservative", "moderate", "aggressive"


class Constraints(BaseModel):
    """Hard constraints that block certain predictions."""
    visa_restrictions: list[str] = []        # Countries/situations blocked
    location_locked_until: datetime | None = None
    career_locked_until: datetime | None = None  # Non-compete end date
    financial_commitments: list[str] = []    # "mortgage", "tuition", etc.


class CommunicationPreferences(BaseModel):
    """How user wants to receive predictions."""
    style: str = "balanced"                  # "direct", "balanced", "gentle", "spiritual"
    wants_probabilities: bool = True         # Show numbers or hide them
    wants_dates: bool = True                 # Specific dates vs "early 2027"
    wants_reasoning: bool = True             # Show astrological evidence
    topics_of_interest: list[str] = []       # ["career", "relationships", "health"]
    topics_to_avoid: list[str] = []          # User doesn't want health predictions
    experience_level: str = "beginner"       # "beginner", "intermediate", "advanced"


class UserModel(BaseModel):
    """Complete structured user model for personalization."""
    user_id: str

    # Life contexts (system-managed, promoted from chat)
    career: CareerContext = CareerContext()
    relationship: RelationshipContext = RelationshipContext()
    location: LocationContext = LocationContext()
    health: HealthContext = HealthContext()
    financial: FinancialContext = FinancialContext()
    constraints: Constraints = Constraints()

    # Preferences (user-editable)
    preferences: CommunicationPreferences = CommunicationPreferences()

    # Metadata
    created_at: datetime
    updated_at: datetime
    last_chat_at: datetime | None = None
    total_sessions: int = 0

    # Confidence tracking
    context_confidence: dict[str, float] = {}  # "career": 0.8, "relationship": 0.3
```

### UserMemory (Unified Wrapper)

```python
class UserMemory(BaseModel):
    """
    Unified wrapper for all 4 memory types.

    This is the primary interface for accessing user memory.
    Each memory type has different storage and access patterns.
    """
    user_id: str

    # 1. Episodic: Vector DB for chat retrieval
    episodic: "EpisodicStore"

    # 2. Semantic: Structured facts (system-managed)
    semantic: "UserModel"

    # 3. Preference: Communication style (user-editable)
    preference: "CommunicationPreferences"

    # 4. Feedback: Prediction corrections (append-only)
    feedback: "FeedbackStore"

    async def retrieve_context(self, query: str, limit: int = 5) -> "MemoryContext":
        """Retrieve all relevant memory for a chat query."""
        return MemoryContext(
            episodic_memories=await self.episodic.search(query, limit),
            user_profile=self.semantic,
            preferences=self.preference,
            recent_feedback=await self.feedback.get_recent(days=30),
        )


class MemoryContext(BaseModel):
    """Context assembled from all memory types for LLM prompt."""
    episodic_memories: list["EpisodicEntry"]
    user_profile: "UserModel"
    preferences: "CommunicationPreferences"
    recent_feedback: list["PredictionFeedback"]

    def to_prompt_section(self) -> str:
        """Format memory context for LLM prompt injection."""
        sections = []

        if self.user_profile.has_data():
            sections.append(f"## What I know about you\n{self.user_profile.summary()}")

        if self.episodic_memories:
            memories = "\n".join(f"- {m.content}" for m in self.episodic_memories[:5])
            sections.append(f"## Recent context\n{memories}")

        if self.preferences.style != "balanced":
            sections.append(f"## Communication style: {self.preferences.style}")

        return "\n\n".join(sections)
```

---

### EpisodicMemory (Vector Storage)

```python
class EpisodicEntry(BaseModel):
    """Single episodic memory entry for vector storage."""
    id: str
    user_id: str
    timestamp: datetime

    # Content
    content: str                             # The actual text snippet
    source: str                              # "user_message", "assistant_inference"

    # Classification
    topics: list[str]                        # ["career", "job_search"]
    sentiment: str | None = None             # "positive", "negative", "neutral"

    # Promotion tracking
    promoted_to_semantic: bool = False
    promotion_timestamp: datetime | None = None

    # Vector (computed)
    embedding: list[float] | None = None
```

### FeedbackEntry

```python
class PredictionFeedback(BaseModel):
    """User feedback on a specific prediction."""
    id: str
    user_id: str
    timestamp: datetime

    # What was predicted
    prediction_id: str
    event_type: EventType
    predicted_window_start: datetime
    predicted_window_end: datetime
    predicted_probability: float

    # What actually happened
    outcome_reported: bool = False
    outcome_date: datetime | None = None
    outcome_accuracy: int | None = None      # 1-5 scale
    outcome_notes: str | None = None

    # What went wrong (if inaccurate)
    wrong_event_type: bool = False           # Predicted career, got relationship
    wrong_timing: bool = False               # Right event, wrong window
    wrong_manifestation: bool = False        # "Promotion" but got "switch"
    user_explanation: str | None = None
```

---

## Memory Promotion Rules

Episodic memories get promoted to semantic (structured) only when confirmed:

```python
class PromotionRule(BaseModel):
    """Rule for promoting episodic → semantic memory."""
    trigger: str                             # "repetition", "confirmation", "explicit"
    min_occurrences: int = 2                 # For repetition trigger
    confidence_threshold: float = 0.7
    requires_user_confirmation: bool = False

PROMOTION_RULES = {
    "career.active_job_search": PromotionRule(
        trigger="confirmation",
        requires_user_confirmation=True,     # Ask "Are you actively job searching?"
    ),
    "career.job_satisfaction": PromotionRule(
        trigger="repetition",
        min_occurrences=2,                   # Mentioned dissatisfaction twice
    ),
    "relationship.status": PromotionRule(
        trigger="explicit",                  # User explicitly stated
        confidence_threshold=0.9,
    ),
    "location.open_to_relocation": PromotionRule(
        trigger="confirmation",
        requires_user_confirmation=True,
    ),
}


async def check_promotion_candidates(
    user_id: str,
    new_entry: EpisodicEntry,
    existing_entries: list[EpisodicEntry],
) -> list[PromotionCandidate]:
    """Check if any episodic memories should be promoted."""

    candidates = []

    # Group by topic
    topic_entries = group_by_topic(existing_entries + [new_entry])

    for topic, entries in topic_entries.items():
        rule = PROMOTION_RULES.get(topic)
        if not rule:
            continue

        if rule.trigger == "repetition":
            # Check if same fact mentioned multiple times
            similar = find_similar_entries(entries, threshold=0.85)
            if len(similar) >= rule.min_occurrences:
                candidates.append(PromotionCandidate(
                    topic=topic,
                    entries=similar,
                    rule=rule,
                    requires_confirmation=rule.requires_user_confirmation,
                ))

        elif rule.trigger == "explicit":
            # High-confidence extraction from single statement
            for entry in entries:
                if entry.confidence >= rule.confidence_threshold:
                    candidates.append(PromotionCandidate(
                        topic=topic,
                        entries=[entry],
                        rule=rule,
                        requires_confirmation=False,
                    ))

    return candidates
```

---

## Context Modifier Formula

Engine output + User Model = Refined prediction.

**Key principle:** Context modifiers can only:
1. Shift *within* event type (promotion vs switch)
2. Suppress unlikely manifestations (visa blocks relocation)
3. Adjust confidence based on user-reported constraints

**They cannot create windows that don't exist.**

```python
class ContextModifier(BaseModel):
    """How user context modifies an engine prediction."""
    event_type: EventType

    # Manifestation weights (must sum to 1.0)
    manifestation_weights: dict[str, float]  # {"promotion": 0.3, "switch": 0.7}

    # Suppression factors (0.0 = blocked, 1.0 = no change)
    suppression_factor: float = 1.0
    suppression_reason: str | None = None

    # Confidence adjustment
    confidence_boost: float = 0.0            # -0.2 to +0.2


def compute_context_modifier(
    event: EventWindow,
    user_model: UserModel,
) -> ContextModifier:
    """Compute how user context modifies an engine prediction."""

    modifier = ContextModifier(
        event_type=event.event_type,
        manifestation_weights={},
    )

    if event.event_type == EventType.CAREER_CHANGE:
        # Default weights
        weights = {"promotion": 0.4, "switch": 0.4, "startup": 0.2}

        career = user_model.career

        # Active job search → bias toward switch
        if career.active_job_search:
            weights["switch"] += 0.3
            weights["promotion"] -= 0.2
            modifier.confidence_boost += 0.1

        # Interviewing → strong bias toward switch
        if career.interview_stage in ["interviewing", "offer"]:
            weights["switch"] += 0.4
            weights["promotion"] -= 0.3

        # Satisfied + growth org → bias toward promotion
        if career.job_satisfaction == "satisfied":
            weights["promotion"] += 0.2
            weights["switch"] -= 0.1

        # Mobility preference
        if career.mobility_preference == "startup":
            weights["startup"] += 0.3
            weights["promotion"] -= 0.2
        elif career.mobility_preference == "promotion":
            weights["promotion"] += 0.3
            weights["switch"] -= 0.2

        # Golden handcuffs → suppress switch
        if career.golden_handcuffs:
            weights["switch"] *= 0.5
            weights["promotion"] += 0.2

        # Normalize
        total = sum(weights.values())
        modifier.manifestation_weights = {k: v/total for k, v in weights.items()}

    elif event.event_type == EventType.RELOCATION:
        # Check hard constraints
        if user_model.constraints.location_locked_until:
            if event.window_start < user_model.constraints.location_locked_until:
                modifier.suppression_factor = 0.2
                modifier.suppression_reason = "Location locked due to constraints"

        if not user_model.location.open_to_relocation:
            modifier.suppression_factor *= 0.3
            modifier.suppression_reason = "User indicated not open to relocation"

        if user_model.career.visa_dependent:
            modifier.suppression_factor *= 0.5
            modifier.confidence_boost -= 0.1

    elif event.event_type == EventType.MARRIAGE:
        rel = user_model.relationship

        if rel.status == "single":
            modifier.suppression_factor = 0.3
            modifier.suppression_reason = "User is currently single"
        elif rel.status == "married":
            modifier.suppression_factor = 0.1
            modifier.suppression_reason = "User is already married"
        elif rel.desire_for_commitment == "actively_seeking":
            modifier.confidence_boost += 0.15

    return modifier


def apply_context_modifier(
    event: EventWindow,
    modifier: ContextModifier,
) -> PersonalizedPrediction:
    """Apply context modifier to engine output."""

    adjusted_probability = (
        event.probability
        * modifier.suppression_factor
        + modifier.confidence_boost
    )
    adjusted_probability = max(0.0, min(1.0, adjusted_probability))

    return PersonalizedPrediction(
        event_type=event.event_type,
        window_start=event.window_start,
        window_end=event.window_end,
        base_probability=event.probability,
        adjusted_probability=adjusted_probability,
        manifestation_weights=modifier.manifestation_weights,
        suppression_applied=modifier.suppression_factor < 1.0,
        suppression_reason=modifier.suppression_reason,
        engine_explanations=event.explanations,
        context_explanations=generate_context_explanations(modifier),
    )
```

---

## Database Models

```python
# SQLAlchemy models for persistence

class UserModelDB(Base):
    """Persistent storage for structured user model."""
    __tablename__ = "user_models"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(255), ForeignKey("users.clerk_id"), unique=True)

    # Store as JSONB for flexibility
    career_context: Mapped[dict] = mapped_column(JSONB, default={})
    relationship_context: Mapped[dict] = mapped_column(JSONB, default={})
    location_context: Mapped[dict] = mapped_column(JSONB, default={})
    health_context: Mapped[dict] = mapped_column(JSONB, default={})
    financial_context: Mapped[dict] = mapped_column(JSONB, default={})
    constraints: Mapped[dict] = mapped_column(JSONB, default={})
    preferences: Mapped[dict] = mapped_column(JSONB, default={})
    context_confidence: Mapped[dict] = mapped_column(JSONB, default={})

    # Metadata
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_chat_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    total_sessions: Mapped[int] = mapped_column(Integer, default=0)


class EpisodicMemoryDB(Base):
    """Persistent storage for episodic memories."""
    __tablename__ = "episodic_memories"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(255), ForeignKey("users.clerk_id"), index=True)

    content: Mapped[str] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(50))
    topics: Mapped[list] = mapped_column(JSONB, default=[])
    sentiment: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # Promotion tracking
    promoted: Mapped[bool] = mapped_column(Boolean, default=False)
    promoted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    promoted_to_field: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    # Vector stored separately in vector DB (pgvector or external)


class PredictionFeedbackDB(Base):
    """Persistent storage for prediction feedback."""
    __tablename__ = "prediction_feedback"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(255), ForeignKey("users.clerk_id"), index=True)

    # Prediction reference
    prediction_id: Mapped[str] = mapped_column(String(36))
    event_type: Mapped[str] = mapped_column(String(50))
    predicted_window_start: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    predicted_window_end: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    predicted_probability: Mapped[float] = mapped_column(Float)

    # Outcome
    outcome_reported: Mapped[bool] = mapped_column(Boolean, default=False)
    outcome_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    outcome_accuracy: Mapped[int | None] = mapped_column(Integer, nullable=True)
    outcome_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Error classification
    wrong_event_type: Mapped[bool] = mapped_column(Boolean, default=False)
    wrong_timing: Mapped[bool] = mapped_column(Boolean, default=False)
    wrong_manifestation: Mapped[bool] = mapped_column(Boolean, default=False)
    user_explanation: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
```

---

## API Endpoints

The complete API stack for the 3-layer prediction architecture:

```
┌─────────────────────────────────────────────────────────────────┐
│                       API Stack                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  POST /charts/natal              → Natal chart (exists)          │
│  POST /predict/timeline          → Engine predictions (Spec 050) │
│  POST /chat                      → Chat with memory integration  │
│  GET/PUT /user-model             → Structured memory (this spec) │
│  GET/PUT /user-model/preferences → User-editable preferences     │
│  POST /feedback                  → Calibration loop              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### User Model CRUD

```python
@app.get("/api/v1/user-model")
async def get_user_model(
    user: CurrentUser = Depends(),
) -> UserModelResponse:
    """Get current user's structured model (user can see what we know)."""
    model = await get_or_create_user_model(user.id)
    return UserModelResponse(
        career=model.career,
        relationship=model.relationship,
        location=model.location,
        preferences=model.preferences,
        constraints=model.constraints,
        context_confidence=model.context_confidence,
        last_updated=model.updated_at,
    )


@app.put("/api/v1/user-model")
async def update_user_model(
    request: UserModelUpdateRequest,
    user: CurrentUser = Depends(),
) -> UserModelResponse:
    """User explicitly updates their model (corrections, preferences)."""
    model = await get_or_create_user_model(user.id)

    # Apply updates (only allowed fields)
    if request.career:
        model.career = model.career.model_copy(update=request.career.model_dump(exclude_unset=True))
    if request.relationship:
        model.relationship = model.relationship.model_copy(update=request.relationship.model_dump(exclude_unset=True))
    if request.preferences:
        model.preferences = model.preferences.model_copy(update=request.preferences.model_dump(exclude_unset=True))
    if request.constraints:
        model.constraints = model.constraints.model_copy(update=request.constraints.model_dump(exclude_unset=True))

    model.updated_at = datetime.now(UTC)
    await save_user_model(model)

    return UserModelResponse.from_model(model)


@app.delete("/api/v1/user-model")
async def reset_user_model(
    user: CurrentUser = Depends(),
) -> dict:
    """Reset user model to defaults (GDPR right to erasure)."""
    await delete_user_model(user.id)
    await delete_episodic_memories(user.id)
    return {"success": True, "message": "User model and memories deleted"}
```

### Preferences (User-Editable)

```python
@app.get("/api/v1/user-model/preferences")
async def get_preferences(
    user: CurrentUser = Depends(),
) -> CommunicationPreferences:
    """Get user's communication preferences."""
    model = await get_or_create_user_model(user.id)
    return model.preferences


@app.put("/api/v1/user-model/preferences")
async def update_preferences(
    request: CommunicationPreferences,
    user: CurrentUser = Depends(),
) -> CommunicationPreferences:
    """Update communication preferences (fully user-controlled)."""
    model = await get_or_create_user_model(user.id)
    model.preferences = request
    model.updated_at = datetime.now(UTC)
    await save_user_model(model)
    return model.preferences
```

### Feedback Collection

```python
@app.post("/api/v1/predictions/{prediction_id}/feedback")
async def submit_prediction_feedback(
    prediction_id: str,
    request: FeedbackRequest,
    user: CurrentUser = Depends(),
) -> FeedbackResponse:
    """Submit feedback on a prediction (for calibration)."""

    feedback = PredictionFeedback(
        id=generate_id(),
        user_id=user.id,
        prediction_id=prediction_id,
        outcome_reported=True,
        outcome_accuracy=request.accuracy,
        outcome_notes=request.notes,
        wrong_event_type=request.wrong_event_type,
        wrong_timing=request.wrong_timing,
        wrong_manifestation=request.wrong_manifestation,
        user_explanation=request.explanation,
        timestamp=datetime.now(UTC),
    )

    await save_feedback(feedback)

    # Trigger async calibration job if enough feedback collected
    await maybe_trigger_calibration(user.id)

    return FeedbackResponse(success=True, feedback_id=feedback.id)


@app.get("/api/v1/predictions/pending-feedback")
async def get_pending_feedback_requests(
    user: CurrentUser = Depends(),
) -> list[PendingFeedbackRequest]:
    """Get predictions that are past their window and need outcome feedback."""

    predictions = await get_past_predictions_without_feedback(user.id)

    return [
        PendingFeedbackRequest(
            prediction_id=p.id,
            event_type=p.event_type,
            window_start=p.window_start,
            window_end=p.window_end,
            predicted_probability=p.probability,
            question=f"Did you experience a {p.event_type.replace('_', ' ')} between {p.window_start:%b %Y} and {p.window_end:%b %Y}?",
        )
        for p in predictions
    ]
```

### Memory Retrieval (Internal)

```python
async def retrieve_relevant_memories(
    user_id: str,
    query: str,
    topics: list[str] | None = None,
    limit: int = 10,
) -> list[EpisodicEntry]:
    """Retrieve relevant episodic memories for chat context."""

    # Embed query
    query_embedding = await embed_text(query)

    # Vector similarity search
    results = await vector_search(
        user_id=user_id,
        embedding=query_embedding,
        filter_topics=topics,
        limit=limit,
    )

    return results


async def add_episodic_memory(
    user_id: str,
    content: str,
    source: str,
    topics: list[str],
) -> EpisodicEntry:
    """Add new episodic memory from chat."""

    entry = EpisodicEntry(
        id=generate_id(),
        user_id=user_id,
        timestamp=datetime.now(UTC),
        content=content,
        source=source,
        topics=topics,
        embedding=await embed_text(content),
    )

    await save_episodic_entry(entry)

    # Check for promotion candidates
    existing = await get_recent_episodic_entries(user_id, days=30)
    candidates = await check_promotion_candidates(user_id, entry, existing)

    for candidate in candidates:
        if not candidate.requires_confirmation:
            await promote_to_semantic(user_id, candidate)
        else:
            await queue_confirmation_question(user_id, candidate)

    return entry
```

---

## Chat Integration

How the LLM layer (Spec 047) uses User Model:

```python
async def generate_personalized_response(
    user_id: str,
    chart_id: str,
    user_message: str,
) -> StreamingResponse:
    """Main chat handler that integrates engine + memory."""

    # 1. Get user model
    user_model = await get_or_create_user_model(user_id)

    # 2. Retrieve relevant episodic memories
    memories = await retrieve_relevant_memories(
        user_id=user_id,
        query=user_message,
        limit=5,
    )

    # 3. Get engine predictions (from Spec 050)
    chart = await get_chart(chart_id)
    context = calculate_sidereal_context(chart.birth_datetime_utc, chart.latitude, chart.longitude)
    timeline = build_composite_timeline(
        context=context,
        start_date=datetime.now(UTC),
        end_date=datetime.now(UTC) + timedelta(days=365 * 2),
        config=DashaEngineConfig(),
    )

    # 4. Apply context modifiers
    personalized_events = []
    for event in timeline.events:
        modifier = compute_context_modifier(event, user_model)
        personalized = apply_context_modifier(event, modifier)
        personalized_events.append(personalized)

    # 5. Build LLM prompt with all context
    prompt_context = build_prompt_context(
        user_message=user_message,
        user_model=user_model,
        memories=memories,
        events=personalized_events,
        chart_context=context,
    )

    # 6. Stream response
    async for chunk in llm_stream(prompt_context):
        yield chunk

    # 7. Extract and store episodic memories from conversation
    await extract_and_store_memories(user_id, user_message)
```

---

## Evidence Panel Data

For the UI "evidence panel" that shows why predictions are personalized:

```python
class EvidencePanelData(BaseModel):
    """Data for the UI evidence panel."""

    # Active astrological context
    active_dasha: dict[str, str]             # {"vimshottari": "Saturn-Mercury", ...}
    current_transits: list[str]              # ["Saturn in 10th", "Jupiter aspecting 7th"]

    # User context applied
    user_context_summary: list[str]          # ["Active job search", "Open to relocation"]

    # How context modified the prediction
    modifications_applied: list[str]         # ["Career switch weighted higher due to interviews"]

    # Confidence breakdown
    engine_confidence: float
    context_adjustment: float
    final_confidence: float


@app.get("/api/v1/predictions/{prediction_id}/evidence")
async def get_prediction_evidence(
    prediction_id: str,
    user: CurrentUser = Depends(),
) -> EvidencePanelData:
    """Get evidence breakdown for a prediction (for UI panel)."""
    # ... implementation
```

---

## Files to Create/Modify

| File | Changes |
|------|---------|
| `backend/src/almamesh/user_model.py` | **NEW** - Core user model + memory logic (~500 LOC) |
| `backend/src/almamesh/database.py` | Add UserModelDB, EpisodicMemoryDB, PredictionFeedbackDB |
| `backend/src/almamesh/api.py` | Add user-model endpoints |
| `backend/src/almamesh/llm.py` | Integrate user model into prompt building |
| `backend/tests/unit/test_user_model.py` | **NEW** - Unit tests |

---

## Implementation Phases

### Phase 1: Core Models + Database
- Define Pydantic models (UserModel, EpisodicEntry, etc.)
- Add SQLAlchemy models
- Migration for new tables
- Basic CRUD operations

### Phase 2: Preferences (User-Editable)
- `/user-model/preferences` endpoints
- Frontend settings page integration
- User can set communication style, topics, etc.

### Phase 3: Context Modifiers
- Implement `compute_context_modifier()`
- Implement `apply_context_modifier()`
- Integration tests with Spec 050 events

### Phase 4: Episodic Memory
- Vector embedding integration (pgvector or external)
- Memory retrieval for chat
- Memory extraction from chat messages

### Phase 5: Memory Promotion
- Promotion rules engine
- Confirmation questions in chat
- Automatic promotion on repetition

### Phase 6: Feedback Loop
- Feedback collection endpoints
- Pending feedback notifications
- Calibration pipeline integration

---

## Success Criteria

1. **Personalization visible**: User sees "Here's what I know about you" panel
2. **Context modifies predictions**: Same engine output, different manifestation weights based on context
3. **No hallucinated windows**: Context can only shift/suppress, never create
4. **Memory persists**: User mentions job search → remembered next session
5. **Feedback collected**: Past predictions prompt for outcome feedback

---

## Privacy Considerations

- User can view everything stored about them (`GET /user-model`)
- User can delete everything (`DELETE /user-model`)
- Sensitive fields (health) only stored if user explicitly shares
- Episodic memories can be browsed and deleted individually
- No third-party sharing of user model data

---

## References

- Spec 050: Composite Dasha Engine (provides event windows)
- Spec 047: PydanticAI Orchestration (consumes user model)
- GDPR Article 17: Right to Erasure
