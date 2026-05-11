#!/usr/bin/env python3
"""
Script for generating skill documentation dynamically from the FiftyOne skills
repositories and plugin manifests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging
import os
import re
import requests
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SKILLS_README_URL = (
    "https://raw.githubusercontent.com/voxel51/fiftyone-skills/main/README.md"
)
SKILLS_GITHUB_BASE = "https://github.com/voxel51/fiftyone-skills/blob/main/"

# Maps the emoji used in the README table to a filter category
EMOJI_CATEGORY = {
    "📥": "Import",
    "📤": "Export",
    "🔍": "QA",
    "🤖": "Inference",
    "📈": "Evaluation",
    "📊": "Embeddings",
    "🔌": "Development",
    "🎨": "Development",
    "📝": "Development",
    "📓": "Development",
    "🏷️": "Annotation",
    "🧹": "Curation",
    "🔧": "Support",
    "🛡️": "Development",
}


@dataclass
class Skill:
    name: str
    description: str
    github_url: str
    category: str = "General"
    emoji: str = "🤖"


def _fetch_text(url: str) -> Optional[str]:
    try:
        resp = requests.get(url, timeout=10)
        if resp.status_code == 200:
            return resp.text
    except Exception as e:
        logger.warning(f"Failed to fetch {url}: {e}")
    return None


def _skills_from_fiftyone_skills_readme(readme: str) -> List[Skill]:
    """Parse the Available Skills table from the fiftyone-skills README."""
    row_re = re.compile(
        r"^\|\s*(.*?)\[(?:\*\*)?([^\]]+?)(?:\*\*)?\]\(([^)]+)\)"
        r"\s*\|\s*([^|]+?)\s*\|\s*(Yes|—|-)\s*\|",
        re.MULTILINE,
    )
    skills = []
    for m in row_re.finditer(readme):
        prefix = m.group(1).strip()
        name = m.group(2).strip()
        rel_url = m.group(3).strip()
        description = m.group(4).strip()

        if "SKILL.md" not in rel_url:
            continue

        emoji = prefix or "🤖"
        category = EMOJI_CATEGORY.get(emoji, "General")
        github_url = SKILLS_GITHUB_BASE + rel_url

        skills.append(
            Skill(
                name=name,
                description=description,
                github_url=github_url,
                category=category,
                emoji=emoji,
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
    :link: {skill.github_url}
    :tags: {skill.category}

"""


def generate_skill_cards_rst(skills: List[Skill]) -> str:
    return "".join(_generate_skill_card(s) for s in skills)


def main():
    docs_dir = Path(os.path.dirname(__file__)).parent
    docs_source = docs_dir / "source"
    skills_cards_dir = docs_source / "agents" / "skills_cards"
    skills_cards_dir.mkdir(parents=True, exist_ok=True)

    logger.info("Fetching fiftyone-skills README...")
    readme = _fetch_text(SKILLS_README_URL)
    if readme:
        skills = _skills_from_fiftyone_skills_readme(readme)
        logger.info(f"Found {len(skills)} skills")
    else:
        logger.warning("Could not fetch fiftyone-skills README")
        skills = []

    rst_content = generate_skill_cards_rst(skills)
    out_path = skills_cards_dir / "skill_cards.rst"
    out_path.write_text(rst_content, encoding="utf-8")
    logger.info(f"Wrote {out_path}")


if __name__ == "__main__":
    main()
