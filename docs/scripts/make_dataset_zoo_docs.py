""""""

from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from jinja2 import Environment, BaseLoader

logger = logging.getLogger(__name__)


_CARD_TEMPLATE = """
.. customcarditem::
    :header: {{ header }}
    :description: {{ description }}
    :link: dataset_zoo_ecosystem/{{ link_slug }}.html
    :image: {{ image_rel }}
    :tags: {{ tags }}
"""


def _normalize_slug(slug: str) -> str:
    return slug.replace("-", "_")


def _extract_table_tags(content: str) -> Dict[str, str]:
    tags_map = {}
    pattern = r"\| :ref:`([^<]+) <dataset-zoo-([^>]+)>`\s*\|\s*([^|]+)\s*\|"

    for match in re.finditer(pattern, content, re.MULTILINE):
        slug = match.group(2).strip()
        tags_raw = match.group(3).strip()
        tags = ",".join(tag.strip() for tag in tags_raw.split(","))
        tags_map[slug] = tags

    return tags_map


def _extract_dataset_sections(content: str) -> List[Tuple[str, str, str]]:
    datasets = []
    anchor_pattern = r"^\.\. _dataset-zoo-([a-z0-9\-]+):"

    for match in re.finditer(anchor_pattern, content, re.MULTILINE):
        slug = match.group(1)
        if slug == "datasets":
            continue

        start_pos = match.start()
        next_match = re.search(
            anchor_pattern, content[start_pos + 1 :], re.MULTILINE
        )
        if next_match:
            end_pos = start_pos + 1 + next_match.start()
        else:
            end_pos = len(content)
        section_content = content[start_pos:end_pos]
        lines = section_content.split("\n")
        title = ""
        for line in lines[1:]:
            line = line.strip()
            if line and not line.startswith(".."):
                title = line
                break

        datasets.append((slug, title, section_content))

    return datasets


def _extract_description(section_content: str) -> str:
    lines = section_content.split("\n")
    description_lines = []
    found_title = False
    for line in lines:
        line = line.strip()
        if not line or line.startswith(".. _dataset-zoo-"):
            continue
        if (
            found_title
            and line
            and not line.startswith("-")
            and not line.startswith("**")
        ):
            if any(
                marker in line
                for marker in [
                    "**Notes**",
                    "**Details**",
                    ".. note::",
                    ".. tabs::",
                ]
            ):
                break
            description_lines.append(line)
        elif line and not line.startswith("-") and not line.startswith("**"):
            found_title = True
            continue
    description = " ".join(description_lines).strip()
    description = re.sub(r"\s+", " ", description)

    if "." in description:
        sentences = description.split(".")
        if len(sentences) >= 2 and len(sentences[0] + sentences[1]) <= 150:
            return sentences[0].strip() + ". " + sentences[1].strip() + "."

    if len(description) > 150:
        return description[:147] + "..."

    return description


def _extract_image(section_content: str) -> Optional[str]:
    pattern = r"\.\. image::\s+/images/dataset_zoo/([^\s]+)"
    match = re.search(pattern, section_content)

    if match:
        filename = match.group(1)
        return f"../_images/{filename}"

    return None


def main():
    environment = Environment(
        loader=BaseLoader, trim_blocks=True, lstrip_blocks=True
    )
    card_template = environment.from_string(_CARD_TEMPLATE)

    docs_dir = Path(__file__).resolve().parent.parent
    source_dir = docs_dir / "source"
    dataset_rst = source_dir / "dataset_zoo" / "dataset.rst"
    out_dir = source_dir / "dataset_zoo" / "dataset_zoo_ecosystem"
    out_dir.mkdir(parents=True, exist_ok=True)

    content = dataset_rst.read_text(encoding="utf-8")

    tags_map = _extract_table_tags(content)
    logger.info("Found %d datasets in table", len(tags_map))

    datasets = _extract_dataset_sections(content)
    logger.info("Found %d dataset sections", len(datasets))

    card_items = []
    for slug, title, section_content in datasets:
        tags = tags_map.get(slug, "")
        description = _extract_description(section_content)
        image_rel = _extract_image(section_content) or ""
        link_slug = _normalize_slug(slug)
        item = card_template.render(
            header=title,
            description=description,
            link_slug=link_slug,
            image_rel=image_rel,
            tags=tags,
        )
        card_items.append(item.strip() + "\n")

    cards_path = out_dir / "dataset_cards.rst"
    cards_path.write_text("\n".join(card_items), encoding="utf-8")

    for slug, title, section_content in datasets:
        link_slug = _normalize_slug(slug)
        dataset_path = out_dir / f"{link_slug}.rst"
        section_lines = section_content.strip().splitlines()
        if section_lines and section_lines[0].startswith(".. _dataset-zoo-"):
            section_lines = section_lines[1:]
            if section_lines and not section_lines[0].strip():
                section_lines = section_lines[1:]
        dataset_path.write_text(
            "\n".join(section_lines) + "\n", encoding="utf-8"
        )

    logger.info("Dataset zoo documentation generated successfully!")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    main()
