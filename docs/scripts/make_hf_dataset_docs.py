"""
Script for generating Hugging Face dataset documentation from Voxel51's HF
organization.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging
import os
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Tuple

import requests
import yaml
from huggingface_hub import HfApi, hf_hub_url


logger = logging.getLogger(__name__)


@dataclass
class HFDataset:
    id: str
    downloads: int
    last_modified: str
    card_data: Optional[str] = None


class HFDatasetDocGenerator:
    def __init__(self, docs_source_dir: str, organization: str = "Voxel51"):
        self.docs_source_dir = Path(docs_source_dir)
        self.organization = organization
        self.dataset_zoo_dir = self.docs_source_dir / "dataset_zoo"
        self.dataset_zoo_dir.mkdir(exist_ok=True)
        self.hf_datasets_dir = self.dataset_zoo_dir / "datasets_hf"
        self.hf_datasets_dir.mkdir(exist_ok=True)
        self.api = HfApi()
        self._compile_regex_patterns()

    def _compile_regex_patterns(self):
        self.emoji_pattern = re.compile(
            r"[\U0001F300-\U0001FAFF\U00002702-\U000027B0\U000024C2-\U0001F251\u2600-\u26FF\u2700-\u27BF]",
            flags=re.UNICODE,
        )
        self.markdown_img_pattern = re.compile(r"!\[[^\]]*\]\(([^)]+)\)")
        self.html_img_pattern = re.compile(
            r'<img[^>]+src=["\']([^"\']+)["\'][^>]*>'
        )

    def _remove_emojis(self, text: str) -> str:
        if not text:
            return text
        return self.emoji_pattern.sub("", text)

    def _parse_yaml_frontmatter(
        self, readme_content: str
    ) -> Tuple[Optional[dict], str]:
        if not readme_content or not readme_content.startswith("---"):
            return None, readme_content

        parts = readme_content.split("---", 2)
        if len(parts) < 3:
            return None, readme_content

        try:
            yaml_content = parts[1].strip()
            metadata = yaml.safe_load(yaml_content) if yaml_content else {}
            clean_content = parts[2].strip()
            return metadata, clean_content
        except Exception as e:
            logger.warning(f"Failed to parse YAML frontmatter: {e}")
            return None, readme_content

    def _make_description(self, name, tasks, license_info=""):
        if tasks:
            task_str = ", ".join(tasks[:3]).replace("-", " ")
            desc = f"Dataset for {task_str}"
        else:
            desc = (
                f"{name.replace('-', ' ').replace('_', ' ').title()} dataset"
            )

        return f"{desc} ({license_info.upper()})" if license_info else desc

    def _make_hf_badge(self, dataset_id):
        url = f"https://huggingface.co/datasets/{dataset_id}"
        badge = f"https://img.shields.io/badge/%F0%9F%A4%97%20Hugging%20Face-Dataset-yellow"
        return f'\n\n<a href="{url}" target="_blank">![Hugging Face]({badge})</a>\n'

    def _to_absolute_url(self, url, dataset_id):
        if url.startswith("http"):
            return url
        return f"https://huggingface.co/datasets/{dataset_id}/resolve/main/{url.lstrip('/')}"

    def _extract_image(self, readme, dataset_id):
        if not readme:
            return None
        match = self.markdown_img_pattern.search(
            readme
        ) or self.html_img_pattern.search(readme)
        return (
            self._to_absolute_url(match.group(1), dataset_id)
            if match
            else None
        )

    def _process_readme(self, readme, dataset_id):
        if not readme:
            return readme

        readme = self.markdown_img_pattern.sub(
            lambda m: f"![{m.group(0)[2:m.group(0).index(']')]}]({self._to_absolute_url(m.group(1), dataset_id)})",
            readme,
        )
        return self.html_img_pattern.sub(
            lambda m: m.group(0).replace(
                m.group(1), self._to_absolute_url(m.group(1), dataset_id)
            ),
            readme,
        )

    def _fetch_datasets(self) -> List[HFDataset]:
        logger.info(f"Fetching datasets from {self.organization}...")
        datasets = []

        try:
            hf_datasets = list(
                self.api.list_datasets(author=self.organization, full=True)
            )
            logger.info(f"Found {len(hf_datasets)} datasets")

            for dataset_info in hf_datasets:
                try:
                    readme_url = hf_hub_url(
                        repo_id=dataset_info.id,
                        filename="README.md",
                        repo_type="dataset",
                    )
                    response = requests.get(
                        readme_url,
                        timeout=10,
                        headers={
                            "User-Agent": "Voxel51-FiftyOne-Docs/1.0 (+https://voxel51.com)"
                        },
                    )
                    card_data = (
                        response.text if response.status_code == 200 else None
                    )

                    dataset = HFDataset(
                        id=dataset_info.id,
                        downloads=getattr(dataset_info, "downloads", 0) or 0,
                        last_modified=dataset_info.last_modified.isoformat()
                        if getattr(dataset_info, "last_modified", None)
                        else "",
                        card_data=card_data,
                    )
                    datasets.append(dataset)
                except requests.RequestException as e:
                    logger.warning(f"Network error for {dataset_info.id}: {e}")
                    continue
                except (ValueError, AttributeError) as e:
                    logger.warning(f"Data error for {dataset_info.id}: {e}")
                    continue

        except Exception as e:
            logger.exception("Error fetching datasets")
            return []

        return datasets

    def _make_dataset_cards(self, datasets: List[HFDataset]) -> str:
        fallback_images = [
            "https://cdn.voxel51.com/zoo-predictions.webp",
            "https://cdn.voxel51.com/yolo-predictions.webp",
            "https://cdn.voxel51.com/torchvision-predictions.webp",
            "https://cdn.voxel51.com/mistake-loc.webp",
            "https://cdn.voxel51.com/mistake-missing.webp",
            "https://cdn.sanity.io/images/h6toihm1/production/d286d778ffac5e30c2af62755808bf566dc5d3b6-2048x1148.webp",
        ]

        datasets.sort(
            key=lambda d: (
                -datetime.fromisoformat(d.last_modified).timestamp()
                if d.last_modified
                else 0,
                -d.downloads,
            )
        )

        rst_content = ""

        for idx, dataset in enumerate(datasets):
            dataset_name = dataset.id.split("/")[-1]
            dataset_slug = dataset_name.lower().replace("-", "_")
            display_name = " ".join(
                word.capitalize()
                for word in dataset_name.replace("_", " ")
                .replace("-", " ")
                .split()
            )

            metadata, clean_content = self._parse_yaml_frontmatter(
                dataset.card_data or ""
            )

            tasks = (
                metadata.get("task_categories", [])
                if metadata
                and isinstance(metadata.get("task_categories"), list)
                else []
            )
            custom_tags = (
                metadata.get("tags", [])
                if metadata and isinstance(metadata.get("tags"), list)
                else []
            )
            license_info = metadata.get("license", "") if metadata else ""

            readme = self._process_readme(clean_content, dataset.id)
            readme = self._remove_emojis(readme)

            with open(
                self.hf_datasets_dir / f"{dataset_slug}.md",
                "w",
                encoding="utf-8",
            ) as f:
                note = """```{note}
This is a **Hugging Face dataset**. For large datasets, ensure `huggingface_hub>=1.1.3` to avoid rate limits. Learn more in the <a href="https://docs.voxel51.com/integrations/huggingface.html#loading-datasets-from-the-hub" target="_blank">Hugging Face integration docs</a>.
```

"""
                f.write(note + self._make_hf_badge(dataset.id) + "\n" + readme)

            image = (
                self._extract_image(dataset.card_data or "", dataset.id)
                or fallback_images[idx % len(fallback_images)]
            )
            header = (
                f"{display_name} · 📥 {dataset.downloads:,}"
                if dataset.downloads > 0
                else display_name
            )
            all_tags = ["huggingface", *tasks, *custom_tags]
            tags = sorted({t.replace("_", "-").lower() for t in all_tags if t})

            hf_badge = '<span class="card-subtitle text-muted" style="background-color: #FFC107; color: black !important; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: 500;">Hugging Face</span><br/>'
            base_description = self._make_description(
                dataset_name, tasks, license_info
            )
            description = f"{hf_badge}{base_description}"

            rst_content += f"""
.. customcarditem::
    :header: {header}
    :description: {description}
    :link: datasets_hf/{dataset_slug}.html
    :image: {image}
    :tags: {",".join(tags)}

"""

        return rst_content

    def run(self):
        datasets = self._fetch_datasets()
        if not datasets:
            logger.warning("No datasets found")
            return

        logger.info(f"Generating documentation for {len(datasets)} datasets")

        dataset_cards_content = self._make_dataset_cards(datasets)
        cards_file = self.hf_datasets_dir / "dataset_cards.rst"
        with open(cards_file, "w", encoding="utf-8") as f:
            f.write(dataset_cards_content)

        logger.info(f"Dataset documentation generated at {cards_file}")


def main():
    docs_source = os.path.join(os.path.dirname(__file__), "..", "source")
    generator = HFDatasetDocGenerator(docs_source)

    try:
        generator.run()
        logger.info(
            "Hugging Face dataset documentation generated successfully!"
        )
    except Exception as e:
        logger.error(f"Error generating dataset documentation: {e}")
        raise


if __name__ == "__main__":
    main()
