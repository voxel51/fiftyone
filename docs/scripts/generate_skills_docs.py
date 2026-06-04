#!/usr/bin/env python3
"""
Script for generating skill documentation dynamically from the FiftyOne skills
repository.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging
import re
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

import requests

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SKILLS_GITHUB_BASE = "https://github.com/voxel51/fiftyone-skills/blob/main/"
SKILLS_RAW_BASE = (
    "https://raw.githubusercontent.com/voxel51/fiftyone-skills/main/"
)
MARKETPLACE_URL = (
    "https://raw.githubusercontent.com/voxel51/fiftyone-skills/main/"
    ".claude-plugin/marketplace.json"
)


@dataclass
class Skill:
    """Represents a skill with its metadata."""

    name: str
    description: str
    github_url: str
    slug: str
    category: str = "General"
    emoji: str = "🤖"


def _fetch(url: str, parse_json: bool = False):
    try:
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
        return resp.json() if parse_json else resp.text
    except requests.RequestException as e:
        logger.warning(f"Failed to fetch {url}: {e}")
    return None


def _skills_from_marketplace(marketplace: dict) -> List[Skill]:
    """Parse skills from the marketplace.json structure."""
    skills = []
    for plugin in marketplace.get("plugins", []):
        source = plugin.get("source", "")
        slug = source.split("/")[-1] if source else plugin["name"]
        github_url = SKILLS_GITHUB_BASE + f"skills/{slug}/SKILL.md"

        skills.append(
            Skill(
                name=plugin["name"],
                description=plugin.get("description", ""),
                github_url=github_url,
                slug=slug,
                category=plugin.get("category", "General"),
                emoji=plugin.get("emoji", "🤖"),
            )
        )
    return skills


def _clean_description(text: str) -> str:
    """Escape colons and strip newlines for RST card description."""
    return re.sub(
        r"[\n:]", lambda m: " " if m.group() == "\n" else "\\:", text
    )


def _generate_skill_card(skill: Skill) -> str:
    """Return a customcarditem RST block for a single skill."""
    description = _clean_description(skill.description)
    return f"""
.. customcarditem::
    :header: {skill.emoji} {skill.name}
    :description: {description}
    :link: skills_ecosystem/{skill.slug}.html
    :tags: {skill.category}

"""


def generate_skill_cards_rst(skills: List[Skill]) -> str:
    return "".join(_generate_skill_card(s) for s in skills)


def _generate_skill_page(skill: Skill, readme_content: str) -> str:
    """Return the content of an individual skill page."""
    return f"""---
myst:
  html_meta:
    "description": "{skill.description}"
    "keywords": "FiftyOne, skill, agent, computer vision, {skill.name}"
    "og:title": "{skill.name} Skill for FiftyOne"
    "og:description": "{skill.description}"
---


<a href="{skill.github_url}" target="_blank">![GitHub Repo](https://img.shields.io/badge/GitHub-Repository-black?logo=github)</a>

{readme_content}
"""


def main():
    docs_dir = Path(__file__).parent.parent
    docs_source = docs_dir / "source"
    skills_ecosystem_dir = docs_source / "agents" / "skills_ecosystem"
    skills_ecosystem_dir.mkdir(parents=True, exist_ok=True)

    logger.info("Fetching marketplace.json...")
    marketplace = _fetch(MARKETPLACE_URL, parse_json=True)
    if marketplace:
        skills = _skills_from_marketplace(marketplace)
        logger.info(f"Found {len(skills)} skills")
    else:
        logger.warning("Could not fetch marketplace.json")
        skills = []

    for skill in skills:
        readme_url = f"{SKILLS_RAW_BASE}skills/{skill.slug}/README.md"
        readme_content = _fetch(readme_url)
        if readme_content:
            page_content = _generate_skill_page(skill, readme_content)
            page_path = skills_ecosystem_dir / f"{skill.slug}.md"
            page_path.write_text(page_content, encoding="utf-8")
            logger.info(f"Wrote {page_path}")
        else:
            logger.warning(f"Could not fetch README for skill '{skill.slug}'")

    rst_content = generate_skill_cards_rst(skills)
    cards_path = skills_ecosystem_dir / "skill_cards.rst"
    cards_path.write_text(rst_content, encoding="utf-8")
    logger.info(f"Wrote {cards_path}")


if __name__ == "__main__":
    main()
