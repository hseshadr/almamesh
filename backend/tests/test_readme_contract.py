"""README contract: the first screen of the root README cannot drift.

The portfolio README template fixes the shape of the first screen (everything
from ``# AlmaMesh`` down to "Try it in 60 seconds"). These are deliberately dumb
string/regex checks, no markdown parser: they exist to stop the first screen
drifting, not to judge prose. Paths resolve from the repository root, so the
test runs from any working directory inside ``make gate``.
"""

from __future__ import annotations

import json
import re
import tomllib
import unicodedata
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
README = REPO_ROOT / "README.md"
FIRST_SCREEN_END = "## How it works"
REQUIRED_LABELS = (
    "**What it does**",
    "**Who it's for**",
    "**What stays on your device / what leaves it**",
    "**Runs on**",
    "**Not for**",
    "**Status**",
)
# Inline links and images: [text](target) / ![alt](target). Fenced code is
# stripped first so example snippets never count as links.
LINK = re.compile(r"!?\[[^\]]*\]\(([^)\s]+)\)")
FENCE = re.compile(r"^```.*?^```", re.MULTILINE | re.DOTALL)


def _readme() -> str:
    return README.read_text(encoding="utf-8")


def _first_screen() -> str:
    text = _readme()
    return text[: text.index(FIRST_SCREEN_END)]


def _tagline() -> str:
    lines = [line.strip() for line in _readme().splitlines()[1:]]
    return next(line for line in lines if line and not line.startswith("[!["))


def _slug(heading: str) -> str:
    """GitHub's heading anchor: lowercase, drop punctuation, spaces to hyphens."""
    lowered = heading.strip().lower()
    kept = "".join(ch for ch in lowered if ch in " -_" or unicodedata.category(ch)[0] in {"L", "N"})
    return kept.replace(" ", "-")


def _links() -> list[str]:
    return LINK.findall(FENCE.sub("", _readme()))


def test_title_then_tagline_matching_every_package_description() -> None:
    assert _readme().splitlines()[0] == "# AlmaMesh"
    tagline = _tagline()
    assert len(tagline) <= 120, len(tagline)
    backend = tomllib.loads((REPO_ROOT / "backend/pyproject.toml").read_text(encoding="utf-8"))
    assert backend["project"]["description"] == tagline
    frontend = json.loads((REPO_ROOT / "frontend/package.json").read_text(encoding="utf-8"))
    assert frontend["description"] == tagline


def test_first_screen_has_at_most_four_badges() -> None:
    text = _readme()
    before_glance = text[: text.index("## At a glance")]
    assert before_glance.count("[![") <= 4


def test_first_screen_has_every_at_a_glance_label() -> None:
    first_screen = _first_screen()
    for label in REQUIRED_LABELS:
        assert label in first_screen, label


def test_status_matches_the_latest_released_changelog_version() -> None:
    changelog = (REPO_ROOT / "CHANGELOG.md").read_text(encoding="utf-8")
    released = re.search(r"^## \[(\d+\.\d+\.\d+)\]", changelog, re.MULTILINE)
    assert released is not None
    version = released.group(1)
    status = next(line for line in _first_screen().splitlines() if "**Status**" in line)
    stage = "Beta" if int(version.split(".")[0]) < 1 else "Stable"
    assert f"**Status** — {stage}: v{version}" in status


def test_try_it_comes_after_the_hero_caption_and_before_how_it_works() -> None:
    text = _readme()
    try_it = text.index("## Try it in 60 seconds")
    assert text.index("Real output of the example below") < try_it
    assert try_it < text.index(FIRST_SCREEN_END)


def test_links_the_interactive_architecture_map() -> None:
    assert re.search(
        r"\[Explore the interactive architecture map[^\]]*\]\(docs/architecture/index\.html\)",
        _readme(),
    )
    assert (REPO_ROOT / "docs/architecture/runtime.architecture.json").is_file()


def test_every_relative_link_resolves_to_a_file_in_the_repo() -> None:
    missing = []
    for target in _links():
        if re.match(r"^[a-z]+:", target) or target.startswith("#"):
            continue
        path = target.split("#", 1)[0]
        if not (REPO_ROOT / path).exists():
            missing.append(target)
    assert missing == []


def test_every_in_page_anchor_names_a_heading() -> None:
    headings = re.findall(r"^#{1,6} (.+)$", FENCE.sub("", _readme()), re.MULTILINE)
    anchors = {_slug(heading) for heading in headings}
    assert "runtime-network-and-data-flow" in anchors
    dangling = [t for t in _links() if t.startswith("#") and t[1:] not in anchors]
    assert dangling == []
