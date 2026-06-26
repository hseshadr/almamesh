"""Pytest fixtures for astronomical validation."""

import json
from pathlib import Path

import pytest

PRIVATE_CASES_PATH = Path(__file__).parent.parent / "fixtures" / "private_cases.jsonl"


@pytest.fixture
def private_cases() -> list[dict]:
    """Load private test cases from JSONL file."""
    if not PRIVATE_CASES_PATH.exists():
        pytest.skip(f"Private cases file not found: {PRIVATE_CASES_PATH}")

    cases = []
    with open(PRIVATE_CASES_PATH) as f:
        for line in f:
            if line.strip():
                cases.append(json.loads(line))
    return cases
