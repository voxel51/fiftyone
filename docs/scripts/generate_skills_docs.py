#!/usr/bin/env python3
"""
Script for generating skill documentation dynamically from the FiftyOne skills
repositories and plugin manifests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import json
import logging
import os
import re
import requests
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Default emoji per category when not specified in SKILL.md frontmatter
CATEGORY_EMOJI = {
    "QA": "🔍",
    "Annotation": "🏷️",
    "Curation": "✂️",
    "Evaluation": "📊",
    "Inference": "🤖",
    "Import": "📥",
    "Export": "📤",
    "Embeddings": "🗺️",
    "Development": "🔧",
    "Support": "🛠️",
    "General": "🤖",
}

SOURCE_BADGE_STYLE = (
    "background:#ff6b35;color:white;padding:2px 6px;"
    "border-radius:4px;font-size:0.8em;font-weight:500"
)

SKILLS_README_URL = (
    "https://raw.githubusercontent.com/voxel51/fiftyone-skills/main/README.md"
)


@dataclass
class Skill:
    """Represents a skill with its metadata."""

    name: str
    description: str
    github_url: str  # Link to SKILL.md on GitHub
    source: str  # "fiftyone-skills" or plugin name e.g. "@voxel51/..."
    category: str = "General"
    emoji: str = "🤖"


def _parse_frontmatter(content: str) -> dict:
    """Parse YAML-like frontmatter block from a SKILL.md file."""
    match = re.match(r"^---\s*\n(.*?)\n---", content, re.DOTALL)
    if not match:
        return {}
    fm = {}
    for line in match.group(1).splitlines():
        if ":" in line:
            key, _, value = line.partition(":")
            fm[key.strip()] = value.strip()
    return fm


def _fetch_text(url: str) -> Optional[str]:
    """Fetch plain text from a URL, return None on failure."""
    try:
        resp = requests.get(url, timeout=10)
        if resp.status_code == 200:
            return resp.text
    except Exception as e:
        logger.warning(f"Failed to fetch {url}: {e}")
    return None


def _skill_from_skill_md(
    raw_url: str, github_url: str, source: str
) -> Optional[Skill]:
    """Fetch a SKILL.md and build a Skill object from its frontmatter."""
    content = _fetch_text(raw_url)
    if not content:
        return None

    fm = _parse_frontmatter(content)
    name = fm.get("name") or raw_url.split("/")[-2]
    description = fm.get("description", "")
    category = fm.get("category", "General")
    emoji = fm.get("emoji") or CATEGORY_EMOJI.get(category, "🤖")

    return Skill(
        name=name,
        description=description,
        github_url=github_url,
        source=source,
        category=category,
        emoji=emoji,
    )


def _skills_from_fiftyone_skills_readme(readme: str) -> List[Skill]:
    """Parse the voxel51/fiftyone-skills README and return Skill objects."""
    skills = []
    # Match markdown table rows: | [name](url) | description |
    row_pattern = re.compile(
        r"\|\s*\[([^\]]+)\]\(([^)]+)\)\s*\|[^|]*\|", re.MULTILINE
    )
    for m in row_pattern.finditer(readme):
        name, url = m.group(1).strip(), m.group(2).strip()
        # Convert GitHub blob URL to raw URL for the SKILL.md
        raw_url = url.replace(
            "github.com", "raw.githubusercontent.com"
        ).replace("/blob/", "/")
        if not raw_url.endswith("SKILL.md"):
            raw_url = raw_url.rstrip("/") + "/SKILL.md"
        github_url = url if "SKILL.md" in url else url
        skill = _skill_from_skill_md(raw_url, github_url, "fiftyone-skills")
        if skill:
            skills.append(skill)
        else:
            # Fallback: use README row data
            skills.append(
                Skill(
                    name=name,
                    description="",
                    github_url=github_url,
                    source="fiftyone-skills",
                )
            )
    return skills


def _skills_from_plugin_skills_json(json_path: Path) -> List[Skill]:
    """Load plugin-contributed skills from the intermediate JSON file."""
    if not json_path.exists():
        return []
    try:
        entries = json.loads(json_path.read_text())
    except Exception as e:
        logger.warning(f"Failed to read {json_path}: {e}")
        return []

    skills = []
    for entry in entries:
        plugin_name = entry.get("plugin_name", "unknown-plugin")
        raw_url = entry.get("raw_url", "")
        github_url = entry.get("github_url", raw_url)
        if not raw_url:
            continue
        skill = _skill_from_skill_md(raw_url, github_url, plugin_name)
        if skill:
            skills.append(skill)
    return skills


def _clean_description(text: str) -> str:
    """Escape colons and strip newlines for RST card description."""
    return re.sub(
        r"[\n:]", lambda m: " " if m.group() == "\n" else "\\:", text
    )


def _generate_skill_card(skill: Skill) -> str:
    """Return a customcarditem RST block for a single skill."""
    source_badge = (
        f'<span class="card-subtitle text-muted" style="{SOURCE_BADGE_STYLE}">'
        f"from {skill.source}</span><br/>"
    )
    description = _clean_description(skill.description)
    return f"""
.. customcarditem::
    :header: {skill.emoji} {skill.name}
    :description: {source_badge}{description}
    :link: {skill.github_url}
    :tags: {skill.category}

"""


def generate_skill_cards_rst(skills: List[Skill]) -> str:
    """Return the full RST content for skill_cards.rst."""
    return "".join(_generate_skill_card(s) for s in skills)


def main():
    docs_dir = Path(os.path.dirname(__file__)).parent
    docs_source = docs_dir / "source"
    skills_cards_dir = docs_source / "agents" / "skills_cards"
    skills_cards_dir.mkdir(parents=True, exist_ok=True)

    skills: List[Skill] = []

    # Source A: voxel51/fiftyone-skills README
    logger.info("Fetching fiftyone-skills README...")
    readme = _fetch_text(SKILLS_README_URL)
    if readme:
        found = _skills_from_fiftyone_skills_readme(readme)
        logger.info(f"Found {len(found)} skills from fiftyone-skills")
        skills.extend(found)
    else:
        logger.warning("Could not fetch fiftyone-skills README")

    # Source B: plugin-contributed skills from generate_plugin_docs.py
    plugin_skills_json = skills_cards_dir / "_plugin_skills.json"
    plugin_skills = _skills_from_plugin_skills_json(plugin_skills_json)
    if plugin_skills:
        logger.info(f"Found {len(plugin_skills)} skills from plugin manifests")
        skills.extend(plugin_skills)

    # Deduplicate by github_url
    seen_urls = set()
    unique_skills = []
    for s in skills:
        if s.github_url not in seen_urls:
            seen_urls.add(s.github_url)
            unique_skills.append(s)

    logger.info(f"Total unique skills: {len(unique_skills)}")

    rst_content = generate_skill_cards_rst(unique_skills)
    out_path = skills_cards_dir / "skill_cards.rst"
    out_path.write_text(rst_content, encoding="utf-8")
    logger.info(f"Wrote {out_path}")


if __name__ == "__main__":
    main()
