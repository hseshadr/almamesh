"""Tests for rule catalog (Spec 052 Phase 2)."""

import pytest

from almamesh.rules import (
    AstrologicalRule,
    RuleCatalog,
    clear_cache,
    get_catalog,
    get_rule,
)

# --- Fixtures ---


@pytest.fixture(autouse=True)
def clear_rule_cache():
    """Clear rule cache before each test."""
    clear_cache()
    yield
    clear_cache()


# --- AstrologicalRule Tests ---


class TestAstrologicalRule:
    """Test AstrologicalRule model."""

    def test_valid_rule_id_pattern(self) -> None:
        """Rule ID must match R_<PATTERN> format."""
        rule = AstrologicalRule(
            rule_id="R_10L_11H",
            category="career",
            pattern="10th lord in 11th house",
            interpretation="Career gains through networks",
        )
        assert rule.rule_id == "R_10L_11H"

    def test_invalid_rule_id_rejected(self) -> None:
        """Invalid rule IDs should be rejected."""
        with pytest.raises(ValueError):
            AstrologicalRule(
                rule_id="invalid",  # Missing R_ prefix
                category="career",
                pattern="test",
                interpretation="test",
            )

    def test_default_values(self) -> None:
        """Test default field values."""
        rule = AstrologicalRule(
            rule_id="R_TEST",
            category="career",
            pattern="test pattern",
            interpretation="test interpretation",
        )
        assert rule.strength_modifier == 1.0
        assert rule.requires_dignity is False
        assert rule.classical_source is None
        assert rule.counter_patterns == []
        assert rule.tags == []
        assert rule.priority == 50
        assert rule.enabled is True

    def test_strength_modifier_bounds(self) -> None:
        """Strength modifier must be between 0.1 and 2.0."""
        # Valid bounds
        rule = AstrologicalRule(
            rule_id="R_TEST",
            category="career",
            pattern="test",
            interpretation="test",
            strength_modifier=1.5,
        )
        assert rule.strength_modifier == 1.5

        # Too low
        with pytest.raises(ValueError):
            AstrologicalRule(
                rule_id="R_TEST",
                category="career",
                pattern="test",
                interpretation="test",
                strength_modifier=0.05,
            )

        # Too high
        with pytest.raises(ValueError):
            AstrologicalRule(
                rule_id="R_TEST",
                category="career",
                pattern="test",
                interpretation="test",
                strength_modifier=2.5,
            )


# --- RuleCatalog Tests ---


class TestRuleCatalog:
    """Test RuleCatalog model."""

    @pytest.fixture
    def sample_catalog(self) -> RuleCatalog:
        """Create a sample catalog for testing."""
        return RuleCatalog(
            domain="test",
            rules=[
                AstrologicalRule(
                    rule_id="R_TEST_1",
                    category="career",
                    pattern="pattern one",
                    interpretation="interpretation one",
                    tags=["tag_a", "tag_b"],
                    enabled=True,
                ),
                AstrologicalRule(
                    rule_id="R_TEST_2",
                    category="career",
                    pattern="pattern two",
                    interpretation="interpretation two",
                    tags=["tag_b", "tag_c"],
                    enabled=True,
                ),
                AstrologicalRule(
                    rule_id="R_TEST_3",
                    category="relationship",
                    pattern="pattern three",
                    interpretation="interpretation three",
                    tags=["tag_a"],
                    enabled=False,  # Disabled
                ),
            ],
        )

    def test_find_by_id(self, sample_catalog: RuleCatalog) -> None:
        """find_by_id returns rule by ID."""
        rule = sample_catalog.find_by_id("R_TEST_1")
        assert rule is not None
        assert rule.rule_id == "R_TEST_1"

    def test_find_by_id_not_found(self, sample_catalog: RuleCatalog) -> None:
        """find_by_id returns None for unknown ID."""
        rule = sample_catalog.find_by_id("R_UNKNOWN")
        assert rule is None

    def test_find_by_id_includes_disabled(self, sample_catalog: RuleCatalog) -> None:
        """find_by_id should return disabled rules (for admin purposes)."""
        rule = sample_catalog.find_by_id("R_TEST_3")
        assert rule is not None
        assert rule.enabled is False

    def test_find_by_pattern(self, sample_catalog: RuleCatalog) -> None:
        """find_by_pattern returns matching rule."""
        rule = sample_catalog.find_by_pattern("pattern one")
        assert rule is not None
        assert rule.rule_id == "R_TEST_1"

    def test_find_by_pattern_not_found(self, sample_catalog: RuleCatalog) -> None:
        """find_by_pattern returns None for unknown pattern."""
        rule = sample_catalog.find_by_pattern("unknown pattern")
        assert rule is None

    def test_find_by_tags_any(self, sample_catalog: RuleCatalog) -> None:
        """find_by_tags with match_all=False returns rules matching ANY tag."""
        rules = sample_catalog.find_by_tags(["tag_a"])
        # Only R_TEST_1 is enabled with tag_a (R_TEST_3 is disabled)
        assert len(rules) == 1
        assert rules[0].rule_id == "R_TEST_1"

    def test_find_by_tags_all(self, sample_catalog: RuleCatalog) -> None:
        """find_by_tags with match_all=True requires ALL tags."""
        rules = sample_catalog.find_by_tags(["tag_a", "tag_b"], match_all=True)
        assert len(rules) == 1
        assert rules[0].rule_id == "R_TEST_1"

    def test_find_by_tags_excludes_disabled(self, sample_catalog: RuleCatalog) -> None:
        """find_by_tags should not return disabled rules."""
        # R_TEST_3 has tag_a but is disabled
        rules = sample_catalog.find_by_tags(["tag_a"])
        rule_ids = [r.rule_id for r in rules]
        assert "R_TEST_3" not in rule_ids

    def test_find_by_category(self, sample_catalog: RuleCatalog) -> None:
        """find_by_category returns rules in category."""
        rules = sample_catalog.find_by_category("career")
        assert len(rules) == 2  # R_TEST_1 and R_TEST_2


# --- Module Function Tests ---


class TestModuleFunctions:
    """Test module-level functions."""

    def test_get_catalog_career(self) -> None:
        """get_catalog loads career rules."""
        catalog = get_catalog("career")
        assert catalog.domain == "career"
        assert len(catalog.rules) >= 10

    def test_get_catalog_relationship(self) -> None:
        """get_catalog loads relationship rules."""
        catalog = get_catalog("relationship")
        assert catalog.domain == "relationship"
        assert len(catalog.rules) >= 10

    def test_get_catalog_unknown_domain(self) -> None:
        """get_catalog raises for unknown domain."""
        with pytest.raises(ValueError, match="Unknown rule domain"):
            get_catalog("unknown_domain")

    def test_get_catalog_caching(self) -> None:
        """get_catalog caches results."""
        catalog1 = get_catalog("career")
        catalog2 = get_catalog("career")
        assert catalog1 is catalog2  # Same object

    def test_get_rule_found(self) -> None:
        """get_rule finds rule across domains."""
        rule = get_rule("R_VENUS_7H")
        assert rule is not None
        assert rule.rule_id == "R_VENUS_7H"

    def test_get_rule_not_found(self) -> None:
        """get_rule returns None for unknown rule."""
        rule = get_rule("R_NONEXISTENT")
        assert rule is None

    def test_clear_cache(self) -> None:
        """clear_cache clears the catalog cache."""
        catalog1 = get_catalog("career")
        clear_cache()
        catalog2 = get_catalog("career")
        # After clearing, should be new object
        assert catalog1 is not catalog2


# --- YAML Content Tests ---


class TestYAMLContent:
    """Test that YAML files have correct content."""

    def test_career_rules_have_required_fields(self) -> None:
        """Career rules must have all required fields."""
        catalog = get_catalog("career")
        for rule in catalog.rules:
            assert rule.rule_id.startswith("R_")
            assert rule.category == "career"
            assert len(rule.pattern) > 0
            assert len(rule.interpretation) > 0
            assert 0.1 <= rule.strength_modifier <= 2.0
            assert len(rule.tags) > 0

    def test_relationship_rules_have_required_fields(self) -> None:
        """Relationship rules must have all required fields."""
        catalog = get_catalog("relationship")
        for rule in catalog.rules:
            assert rule.rule_id.startswith("R_")
            assert rule.category == "relationship"
            assert len(rule.pattern) > 0
            assert len(rule.interpretation) > 0
            assert 0.1 <= rule.strength_modifier <= 2.0
            assert len(rule.tags) > 0

    def test_rule_ids_unique_within_domain(self) -> None:
        """Rule IDs should be unique within each domain."""
        for domain in ["career", "relationship"]:
            catalog = get_catalog(domain)
            rule_ids = [r.rule_id for r in catalog.rules]
            assert len(rule_ids) == len(set(rule_ids)), f"Duplicate rule IDs in {domain}"
