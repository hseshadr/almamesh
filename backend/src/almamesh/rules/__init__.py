"""
Rule catalog module (Spec 052 Phase 2).

COHESION: All rule loading and access in one place.
COUPLING: Used by predictive/claim_generator.py for mechanism steps.
"""

from functools import cache
from pathlib import Path

import yaml

from .rule_types import AstrologicalRule, RuleCatalog

__all__ = ["AstrologicalRule", "RuleCatalog", "get_catalog", "get_rule"]

CATALOG_DIR = Path(__file__).parent


@cache
def get_catalog(domain: str) -> RuleCatalog:
    """
    Get rule catalog by domain.

    Args:
        domain: Domain name (career, relationship, etc.)

    Returns:
        RuleCatalog for the domain

    Raises:
        ValueError: If domain not found
    """
    path = CATALOG_DIR / f"{domain}_rules.yaml"
    if not path.exists():
        raise ValueError(f"Unknown rule domain: {domain}")

    with open(path) as f:
        data = yaml.safe_load(f)

    return RuleCatalog(**data)


def get_rule(rule_id: str) -> AstrologicalRule | None:
    """
    Global rule lookup across all domains.

    Convention: rule_id format is R_<PATTERN>
    Domain is inferred from the rule file or searched.
    """
    # Search known domains
    for domain in ["career", "relationship", "finance", "health", "timing", "general"]:
        try:
            catalog = get_catalog(domain)
            rule = catalog.find_by_id(rule_id)
            if rule:
                return rule
        except ValueError:
            continue
    return None


def clear_cache() -> None:
    """Clear cached catalogs (useful for testing)."""
    get_catalog.cache_clear()
