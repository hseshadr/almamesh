"""Pydantic models for the astrological rule catalog.

COHESION: High - All models relate to rule definition and lookup.
COUPLING: Low - Only depends on Pydantic, no internal imports.
"""

from pydantic import BaseModel, Field


class AstrologicalRule(BaseModel):
    """Single interpretive rule with evidence.

    Rules encode pattern-interpretation pairs from classical sources,
    with metadata for strength modification and conflict resolution.
    """

    rule_id: str = Field(..., pattern=r"^R_[A-Z0-9_]+$")  # e.g., "R_10L_11H"
    category: str  # "career", "relationship", etc.
    pattern: str  # "10th lord in 11th house"
    interpretation: str  # "career gains through networks"
    strength_modifier: float = Field(default=1.0, ge=0.1, le=2.0)
    requires_dignity: bool = False
    classical_source: str | None = None  # "BPHS 35.12"
    counter_patterns: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    priority: int = Field(default=50, ge=1, le=100)  # For conflict resolution
    enabled: bool = True  # Toggle without removing


class RuleCatalog(BaseModel):
    """Collection of rules for a domain.

    Provides lookup methods for finding rules by ID, pattern, tags, or category.
    All query methods respect the `enabled` flag except `find_by_id`.
    """

    domain: str
    rules: list[AstrologicalRule]

    def find_by_id(self, rule_id: str) -> AstrologicalRule | None:
        """Direct lookup by rule_id."""
        for rule in self.rules:
            if rule.rule_id == rule_id:
                return rule
        return None

    def find_by_pattern(self, pattern: str) -> AstrologicalRule | None:
        """Find rule matching a chart pattern."""
        for rule in self.rules:
            if rule.pattern == pattern:
                return rule
        return None

    def find_by_tags(self, tags: list[str], match_all: bool = False) -> list[AstrologicalRule]:
        """Find rules matching tags.

        Args:
            tags: List of tags to match against.
            match_all: If True, requires ALL tags present. If False, any tag matches.

        Returns:
            List of enabled rules matching the tag criteria.
        """
        if match_all:
            return [r for r in self.rules if r.enabled and all(t in r.tags for t in tags)]
        return [r for r in self.rules if r.enabled and any(t in r.tags for t in tags)]

    def find_by_category(self, category: str) -> list[AstrologicalRule]:
        """Filter by category.

        Args:
            category: Category name to filter by (e.g., "career", "relationship").

        Returns:
            List of enabled rules in the specified category.
        """
        return [r for r in self.rules if r.enabled and r.category == category]
