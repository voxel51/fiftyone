#!/usr/bin/env python3
"""
Script for generating skill documentation dynamically from the FiftyOne skills
repository.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging
import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional

import requests
import yaml

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

INTERNAL_SKILLS_API_BASE = (
    "https://api.github.com/repos/voxel51/fiftyone-internal-skills/contents/"
)
INTERNAL_SKILLS_GITHUB_BASE = (
    "https://github.com/voxel51/fiftyone-internal-skills/blob/main/"
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
    extra_tags: List[str] = field(default_factory=list)
    prefetched_readme: Optional[str] = field(default=None, repr=False)


def _fetch(url: str, parse_json: bool = False, token: Optional[str] = None):
    """Fetch a URL, optionally with a GitHub token, and return the content."""
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        resp = requests.get(url, headers=headers, timeout=10)
        resp.raise_for_status()
        return resp.json() if parse_json else resp.text
    except requests.RequestException as e:
        logger.warning(f"Failed to fetch {url}: {e}")
    return None


def _parse_skill_frontmatter(content: str) -> dict:
    """Parse YAML frontmatter from a SKILL.md file."""
    parts = re.split(r"^---\s*$", content, maxsplit=2, flags=re.MULTILINE)
    if len(parts) < 3:
        return {}
    try:
        result = yaml.safe_load(parts[1])
        return result if isinstance(result, dict) else {}
    except yaml.YAMLError:
        return {}


def _fetch_internal_file(path: str, token: str) -> Optional[str]:
    """Fetch a file from fiftyone-internal-skills via the GitHub API."""
    headers = {
        "Accept": "application/vnd.github.v3.raw",
        "Authorization": f"Bearer {token}",
    }
    try:
        resp = requests.get(
            f"{INTERNAL_SKILLS_API_BASE}{path}", headers=headers, timeout=10
        )
        resp.raise_for_status()
        return resp.text
    except requests.RequestException as e:
        logger.warning(f"Failed to fetch {path}: {e}")
    return None


def _fetch_enterprise_skills() -> List[Skill]:
    """Fetch skills from the fiftyone-internal-skills plugin repo."""
    token = os.getenv("GITHUB_TOKEN")
    if not token:
        logger.warning("GITHUB_TOKEN not set — skipping enterprise skills")
        return []

    yml_content = _fetch_internal_file("fiftyone.yml", token)
    if not yml_content:
        logger.warning(
            "Could not fetch fiftyone.yml from fiftyone-internal-skills"
        )
        return []

    try:
        plugin_config = yaml.safe_load(yml_content) or {}
    except yaml.YAMLError as e:
        logger.warning(f"Failed to parse fiftyone.yml: {e}")
        return []

    declared = plugin_config.get("skills", [])
    if not declared:
        logger.warning("No skills declared in fiftyone.yml")
        return []

    logger.info(
        f"Found {len(declared)} declared skills in fiftyone-internal-skills"
    )

    skills = []
    for skill_name in declared:
        if not re.match(r"^[a-zA-Z0-9_-]+$", skill_name):
            logger.warning(f"Skipping skill with unsafe name: '{skill_name}'")
            continue

        skill_md = _fetch_internal_file(f"skills/{skill_name}/SKILL.md", token)
        if not skill_md:
            logger.warning(f"No SKILL.md for '{skill_name}', skipping")
            continue

        readme = _fetch_internal_file(f"skills/{skill_name}/README.md", token)
        if not readme:
            logger.info(f"No README.md for '{skill_name}', skipping")
            continue

        metadata = _parse_skill_frontmatter(skill_md)

        skills.append(
            Skill(
                name=metadata.get("name", skill_name),
                description=metadata.get("description", ""),
                github_url=(
                    INTERNAL_SKILLS_GITHUB_BASE
                    + f"skills/{skill_name}/SKILL.md"
                ),
                slug=skill_name,
                category=metadata.get("category", "General"),
                emoji=metadata.get("emoji", "🤖"),
                extra_tags=["Enterprise"],
                prefetched_readme=readme,
            )
        )

    logger.info(f"Loaded {len(skills)} enterprise skills")
    return skills


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
    if "Enterprise" in skill.extra_tags:
        badge = (
            '<span class="card-subtitle text-muted" style="background-color: #ff6b35;'
            " color: white !important; padding: 2px 6px; border-radius: 4px;"
            ' font-size: 0.8em; font-weight: 500;">Enterprise</span><br/>'
        )
        description = badge + description
    tags = ",".join(filter(None, [skill.category] + skill.extra_tags))
    return f"""
.. customcarditem::
    :header: {skill.emoji} {skill.name}
    :description: {description}
    :link: skills_ecosystem/{skill.slug}.html
    :tags: {tags}

"""


def generate_skill_cards_rst(skills: List[Skill]) -> str:
    return "".join(_generate_skill_card(s) for s in skills)


def _generate_skill_page(skill: Skill, readme_content: str) -> str:
    """Return the content of an individual skill page."""
    if "Enterprise" in skill.extra_tags:
        badge = "![Enterprise Skill](https://img.shields.io/badge/Enterprise-Skill-orange)"
    else:
        badge = (
            f'<a href="{skill.github_url}" target="_blank">'
            "![GitHub Repo](https://img.shields.io/badge/GitHub-Repository-black?logo=github)"
            "</a>"
        )

    return f"""---
myst:
  html_meta:
    "description": "{skill.description}"
    "keywords": "FiftyOne, skill, agent, computer vision, {skill.name}"
    "og:title": "{skill.name} Skill for FiftyOne"
    "og:description": "{skill.description}"
---


{badge}

{readme_content}
"""


def main():
    docs_dir = Path(__file__).parent.parent
    docs_source = docs_dir / "source"
    skills_ecosystem_dir = docs_source / "agents" / "skills_ecosystem"
    skills_ecosystem_dir.mkdir(parents=True, exist_ok=True)

    logger.info("Fetching marketplace.json...")
    marketplace = _fetch(MARKETPLACE_URL, parse_json=True)
    if marketplace is not None:
        skills = _skills_from_marketplace(marketplace)
        logger.info(f"Found {len(skills)} public skills")
    else:
        logger.warning("Could not fetch marketplace.json")
        skills = []

    logger.info("Fetching enterprise skills...")
    enterprise_skills = _fetch_enterprise_skills()
    skills += enterprise_skills

    for skill in skills:
        readme_content = skill.prefetched_readme or _fetch(
            f"{SKILLS_RAW_BASE}skills/{skill.slug}/README.md"
        )

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
