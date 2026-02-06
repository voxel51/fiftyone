#!/usr/bin/env python3
"""
Script for generating plugin documentation dynamically from the FiftyOne plugins repository.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import os
import re
import requests
import logging
from pathlib import Path
from typing import List, Optional, Tuple
from dataclasses import dataclass
from urllib.parse import urlparse, urljoin
from datetime import datetime

import eta.core.utils as etau

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class Plugin:
    """Represents a plugin with its metadata."""

    name: str
    description: str
    github_url: str
    readme_url: str
    category: str
    icon: Optional[str] = None


class PluginDocGenerator:
    """Generates plugin documentation from the FiftyOne plugins repository."""

    def __init__(self, docs_source_dir: str):
        self.docs_source_dir = Path(docs_source_dir)
        self.plugins_dir = self.docs_source_dir / "plugins"
        self.plugins_dir.mkdir(exist_ok=True)
        self.plugins_ecosystem_dir = self.plugins_dir / "plugins_ecosystem"
        self.plugins_ecosystem_dir.mkdir(exist_ok=True)
        self.models_dir = self.docs_source_dir / "model_zoo" / "models"
        self.models_dir.mkdir(parents=True, exist_ok=True)
        self._plugin_model_cards = []
        self._compile_regex_patterns()

    def _compile_regex_patterns(self):
        """Pre-compile all regex patterns for better performance."""
        self.emoji_pattern = re.compile(
            r"[\U0001F300-\U0001FAFF\U00002702-\U000027B0\U000024C2-\U0001F251\u2600-\u26FF\u2700-\u27BF]",
            flags=re.UNICODE,
        )
        self.feature_patterns = [
            (re.compile(p), f)
            for p, f in [
                (r"vlm|vision.?language|multimodal", "Vision-Language Model"),
                (
                    r"qwen|gemini|gpt-?4|claude|llava|minicpm",
                    "Vision-Language Model",
                ),
                (r"sam\d?|segment\s?anything", "Segmentation"),
                (r"segmentation|instance.?mask", "Segmentation"),
                (r"object.?detection|yolo|detectron", "Detection"),
                (r"ocr|text.?recognition|document.?parsing", "OCR & Document"),
                (r"pose.?estimation|keypoint|vitpose", "Pose Estimation"),
                (r"embedding|siglip|clip|nomic", "Embeddings"),
                (r"similarity.?search|retrieval|vector", "Search & Retrieval"),
                (r"semantic.?search", "Semantic Search"),
                (r"deduplication|duplicate", "Data Curation"),
                (r"clustering|outlier|anomaly", "Data Curation"),
                (r"quality.?issue|image.?issue", "Data Quality"),
                (r"annotation|label|cvat|labelbox", "Annotation"),
                (r"evaluation|metrics|confidence.?threshold", "Evaluation"),
                (r"active.?learning", "Active Learning"),
                (r"video.?understanding|video.?analysis", "Video Analysis"),
                (r"3d|point.?cloud|depth", "3D Vision"),
                (r"medical|healthcare|dicom|radiology", "Medical Imaging"),
                (r"audio|speech", "Audio"),
                (r"pdf|document", "Document Processing"),
                (r"import|export|loader", "Data Import/Export"),
                (r"augmentation|transform", "Augmentation"),
                (r"anonymize|blur|privacy", "Privacy Tools"),
            ]
        ]
        self.table_section_pattern = re.compile(
            r"## {}\s*\n\n(.*?)(?=\n## |\n$)", re.DOTALL
        )
        self.table_row_pattern = re.compile(
            r"<tr>\s*<td[^>]*>(.*?)</td>\s*<td[^>]*>(.*?)</td>\s*</tr>",
            re.DOTALL,
        )
        self.link_pattern = re.compile(
            r'<a[^>]*href="([^"]*)"[^>]*>([^<]*)</a>'
        )
        self.html_tag_pattern = re.compile(r"<[^>]+>")
        self.icon_description_pattern = re.compile(r"^([^\s]+)\s*(.+)")
        self.markdown_img_pattern = re.compile(r"!\[[^\]]*\]\(([^)]+)\)")
        self.user_attachments_pattern = re.compile(
            r"https://github\.com/user-attachments/assets/[a-f0-9-]+"
        )
        self.github_assets_pattern = re.compile(
            r"https://github\.com/[^/]+/[^/]+/assets/\d+/[a-f0-9-]+"
        )
        self.html_img_pattern = re.compile(
            r'<img[^>]+src=["\']([^"\']+)["\'][^>]*>'
        )
        self.markdown_img_replace_pattern = re.compile(
            r"!\[([^\]]*)\]\(([^)]+)\)"
        )
        self.html_img_replace_pattern = re.compile(
            r'(<img[^>]+src=["\'])([^"\']+)(["\'][^>]*>)'
        )
        self.bare_github_url_pattern = re.compile(
            r"^https://github\.com/[^/]+/[^/]+/[^\s]+$", re.MULTILINE
        )
        self.description_cleanup_pattern = re.compile(r"[\n:]")
        self.download_model_pattern = re.compile(
            r"\bdef\s+download_model\s*\("
        )
        self.load_dataset_pattern = re.compile(r"\bdef\s+load_dataset\s*\(")

    def _remove_emojis(self, text: str) -> str:
        """Remove emoji and miscellaneous symbols from a string.

        This targets common Unicode emoji blocks and symbol ranges while leaving
        standard ASCII and most typical punctuation intact.
        """
        if not text:
            return text
        return self.emoji_pattern.sub("", text)

    def _clean_description(self, description: str) -> str:
        """Clean up plugin description by replacing newlines and colons."""
        return self.description_cleanup_pattern.sub(
            lambda m: " " if m.group(0) == "\n" else "\\:", description
        )

    def _generate_seo_metadata(
        self, plugin: Plugin, readme_content: str
    ) -> dict:
        """Generate SEO metadata for a plugin."""
        display_name = self._get_display_name(plugin.name)
        feature = self._extract_feature_hint(readme_content)
        return {
            "title": self._generate_meta_title(display_name, feature),
            "description": self._generate_meta_description(
                plugin.description, readme_content
            ),
            "keywords": self._generate_keywords(
                display_name, plugin.category, feature
            ),
        }

    def _get_display_name(self, plugin_name: str) -> str:
        """Convert plugin name to display format."""
        name = plugin_name.split("/")[-1].replace("`", "").strip()
        return " ".join(
            word.capitalize()
            for word in name.replace("_", " ").replace("-", " ").split()
        )

    def _generate_meta_title(
        self, display_name: str, feature: Optional[str]
    ) -> str:
        """Generate SEO-optimized meta title for a plugin."""
        if feature:
            return f"{display_name} Plugin for FiftyOne | {feature}"
        return f"{display_name} Plugin for FiftyOne"

    def _extract_feature_hint(self, readme_content: str) -> Optional[str]:
        """Extract a feature hint from README content."""
        if not readme_content:
            return None

        content_lower = readme_content.lower()
        for pattern, feature in self.feature_patterns:
            if pattern.search(content_lower):
                return feature
        return None

    def _generate_meta_description(
        self, description: str, readme_content: str
    ) -> str:
        """Generate SEO-optimized meta description for a plugin."""
        base = description.strip().rstrip(".")
        extra = self._extract_first_sentence(readme_content)

        if extra and extra.lower() != base.lower():
            full = f"{base}. {extra}"
        else:
            full = f"{base}. Open source FiftyOne plugin for computer vision workflows."

        if len(full) > 155:
            full = full[:152].rsplit(" ", 1)[0] + "..."
        return full

    def _extract_first_sentence(self, readme_content: str) -> Optional[str]:
        """Extract the first meaningful sentence from README content."""
        if not readme_content:
            return None

        for line in readme_content.split("\n"):
            line = line.strip()
            if not line or line.startswith(("#", "!", "<", "```", "[!", "|-")):
                continue

            sentence = re.split(r"(?<=[.!?])\s", line)[0]
            if len(sentence) > 20:
                return sentence.strip()
        return None

    def _generate_keywords(
        self, display_name: str, category: str, feature: Optional[str] = None
    ) -> str:
        """Generate SEO keywords for a plugin."""
        base_keywords = ["FiftyOne", "plugin", "computer vision"]
        words = display_name.lower().replace("-", " ").split()
        name_keywords = [w for w in words if len(w) > 2]
        all_keywords = base_keywords + name_keywords + [category]
        if feature:
            all_keywords.append(feature.lower())

        seen = set()
        unique = []
        for kw in all_keywords:
            kw_lower = kw.lower()
            if kw_lower not in seen and kw_lower not in ("for", "the", "and"):
                seen.add(kw_lower)
                unique.append(kw)
        return ", ".join(unique[:10])

    def _generate_frontmatter(self, seo_metadata: dict) -> str:
        """Generate MyST frontmatter with SEO metadata."""
        title = (
            seo_metadata["title"]
            .replace("\\", "\\\\")
            .replace('"', '\\"')
            .replace("\n", "\\n")
        )
        description = (
            seo_metadata["description"]
            .replace("\\", "\\\\")
            .replace('"', '\\"')
            .replace("\n", "\\n")
        )
        keywords = (
            seo_metadata["keywords"]
            .replace("\\", "\\\\")
            .replace('"', '\\"')
            .replace("\n", "\\n")
        )

        return f"""---
myst:
  html_meta:
    "description": "{description}"
    "keywords": "{keywords}"
    "og:title": "{title}"
    "og:description": "{description}"
---

"""

    def _generate_github_badge(self, plugin: Plugin) -> str:
        """Generate GitHub badge markdown for a plugin."""
        return f'\n\n<a href="{plugin.github_url}" target="_blank">![GitHub Repo](https://img.shields.io/badge/GitHub-Repository-black?logo=github)</a>\n'

    def _parse_github_url(self, github_url: str) -> Tuple[str, str, str]:
        """Parse a GitHub URL and return (owner, repo, path)."""
        parts = urlparse(github_url).path.strip("/").split("/")

        if len(parts) < 2:
            raise ValueError(f"Invalid GitHub URL: {github_url}")

        owner, repo = parts[0], parts[1]
        path = ""
        if len(parts) > 4 and parts[2] in ("blob", "tree"):
            path = "/".join(parts[4:])
        return owner, repo, path

    def fetch_github_readme(
        self, owner: str, repo: str, path: str = ""
    ) -> str:
        """Fetch README from GitHub (root or subfolder)."""
        token = os.getenv("GITHUB_TOKEN")
        headers = {"Accept": "application/vnd.github.v3.raw"}
        if token:
            headers["Authorization"] = f"Bearer {token}"

        if not path:
            return self._fetch_root_readme(owner, repo, headers)
        return self._fetch_subfolder_readme(owner, repo, path)

    def _fetch_root_readme(self, owner: str, repo: str, headers: dict) -> str:
        """Fetch root README using GitHub API with raw fallback."""
        try:
            url = f"https://api.github.com/repos/{owner}/{repo}/readme"
            resp = requests.get(url, headers=headers, timeout=10)
            resp.raise_for_status()
            return resp.text
        except requests.RequestException as e:
            logger.warning(f"Failed to fetch root README via API: {e}")
            return self._fetch_raw_readme(owner, repo, "", None)

    def _fetch_subfolder_readme(self, owner: str, repo: str, path: str) -> str:
        """Fetch subfolder README from raw GitHub."""
        return self._fetch_raw_readme(owner, repo, path, None)

    def _fetch_raw_readme(
        self, owner: str, repo: str, path: str, branch: Optional[str] = None
    ) -> str:
        """Fetch README from raw GitHub URL with branch fallback."""
        subpath = f"{path}/README.md" if path else "README.md"
        branches = [branch] if branch else ["main", "master"]
        for b in branches:
            raw_url = f"https://raw.githubusercontent.com/{owner}/{repo}/{b}/{subpath}"
            try:
                resp = requests.get(raw_url, timeout=10)
                if resp.status_code == 200:
                    return resp.text
            except requests.RequestException as e:
                logger.warning(f"Failed to fetch README from {raw_url}: {e}")
        logger.exception(
            f"Failed to fetch README for {owner}/{repo} at {path or '.'}"
        )
        return ""

    def fetch_github_stars(self, owner: str, repo: str) -> Optional[dict]:
        """Fetch stargazers count and update date for a GitHub repository."""
        try:
            token = os.getenv("GITHUB_TOKEN")
            headers = {"Accept": "application/vnd.github.v3+json"}
            if token:
                headers["Authorization"] = f"Bearer {token}"

            api_url = f"https://api.github.com/repos/{owner}/{repo}"
            resp = requests.get(api_url, headers=headers, timeout=8)

            if resp.status_code == 200:
                data = resp.json()
                return {
                    "stars": int(data.get("stargazers_count", 0)),
                    "updated_at": data.get("updated_at"),
                    "default_branch": data.get("default_branch"),
                }
            logger.warning(
                f"Failed to fetch stars for {owner}/{repo}: {resp.status_code}"
            )
        except Exception as e:
            logger.warning(f"Error fetching stars for {owner}/{repo}: {e}")
        return None

    def _fetch_plugin_manifest(
        self, owner: str, repo: str, path: str, branch: str
    ) -> Optional[List[dict]]:
        """Fetch and parse manifest.json from a plugin repository."""
        manifest_path = f"{path}/manifest.json" if path else "manifest.json"
        url = f"https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{manifest_path}"
        try:
            resp = requests.get(url, timeout=6)
            if resp.status_code != 200:
                return None
            data = resp.json()
            if not isinstance(data, dict):
                return None
            return data.get("models", [])
        except (requests.RequestException, ValueError) as e:
            logger.debug(f"No manifest found at {url}: {e}")
        return None

    def _format_model_tags(self, tags: List[str]) -> List[str]:
        """Convert model tags to display format."""
        display_tags = []
        for tag in tags:
            if tag == "torch":
                display_tags.append("PyTorch")
            elif tag in ("tf", "tf1", "tf2"):
                display_tags.append(
                    "TensorFlow" + ("-" + tag[2:] if len(tag) > 2 else "")
                )
            else:
                display_tags.append(tag.capitalize().replace(" ", "-"))
        return display_tags

    def _generate_plugin_model_docs(
        self,
        models: List[dict],
        plugin_name: str,
        plugin_link: str,
        github_url: str,
    ) -> None:
        """Generate model documentation for plugin models."""
        for model in models:
            name = model.get("base_name")
            if not name:
                continue

            description = self._clean_description(model.get("description", ""))
            tags = model.get("tags") or []
            source = model.get("source", "")
            author = model.get("author")
            license_str = model.get("license")
            req = model.get("requirements") or {}
            size_bytes = model.get("size_bytes")
            size_str = (
                etau.to_human_bytes_str(size_bytes, decimals=2)
                if size_bytes
                else None
            )
            packages = req.get("packages") or []
            supports_cpu = (
                "yes" if (req.get("cpu") or {}).get("support") else "no"
            )
            supports_gpu = (
                "yes" if (req.get("gpu") or {}).get("support") else "no"
            )
            model_slug = re.sub(r"[^\w]", "_", name)
            safe_name = plugin_name.replace("-", "--").replace("_", "__")

            content = f"""
.. _model-zoo-{model_slug}:

{name}
{"_" * len(name)}

.. raw:: html

    <a href="../../plugins/{plugin_link}" target="_blank">
        <img src="https://img.shields.io/badge/Plugin-{safe_name}-orange" alt="From Plugin">
    </a>

.. note::

    This is a :ref:`remotely-sourced model <model-zoo-remote>` from the
    `{plugin_name} <../../plugins/{plugin_link}>`_ plugin, maintained by the community.
    It is not part of FiftyOne core and may have special installation requirements.
    Please review the plugin documentation and license before use.

{description}.

**Details**

-   Model name: ``{name}``
-   Model source: {source}
"""
            if author:
                content += f"-   Model author: {author}\n"
            if license_str:
                content += f"-   Model license: {license_str}\n"
            if size_str:
                content += f"-   Model size: {size_str}\n"

            content += f"""-   Exposes embeddings? {"yes" if "embeddings" in tags else "no"}
-   Tags: ``{", ".join(tags)}``

**Requirements**

"""
            if packages:
                content += f"-   Packages: ``{', '.join(packages)}``\n\n"

            content += f"""-   CPU support

    -   {supports_cpu}

-   GPU support

    -   {supports_gpu}

**Example usage**

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    foz.register_zoo_model_source("{github_url}")

    dataset = foz.load_zoo_dataset(
        "coco-2017",
        split="validation",
        dataset_name=fo.get_default_dataset_name(),
        max_samples=50,
        shuffle=True,
    )

    model = foz.load_zoo_model("{name}")

    dataset.apply_model(model, label_field="predictions")

    session = fo.launch_app(dataset)
"""
            model_path = self.models_dir / f"{model_slug}.rst"
            with open(model_path, "w", encoding="utf-8") as f:
                f.write(content)

            display_tags = self._format_model_tags(tags)
            display_tags.append("Plugin")

            self._plugin_model_cards.append(
                f"""
.. customcarditem::
    :header: {name}
    :description: {description}
    :link: models/{model_slug}.html
    :tags: {",".join(display_tags)}
"""
            )
            logger.info(f"Generated model docs for {name}")

    def extract_plugins_from_readme(self, readme_content: str) -> List[Plugin]:
        """Extract plugin information from the README content."""
        plugins = []

        sections = [
            ("Community Plugins", "community"),
            ("Core Plugins", "voxel51"),
            ("Voxel51 Plugins", "voxel51"),
        ]

        for section_name, category in sections:
            section = self._extract_table_section(readme_content, section_name)
            if section:
                plugins.extend(self._parse_html_table(section, category))

        return plugins

    def _extract_table_section(
        self, content: str, section_name: str
    ) -> Optional[str]:
        """Extract a table section from the README content."""
        pattern = self.table_section_pattern.pattern.replace(
            "{}", re.escape(section_name)
        )
        match = re.search(pattern, content, re.DOTALL)
        return match.group(1) if match else None

    def _parse_html_table(
        self, table_content: str, category: str
    ) -> List[Plugin]:
        """Parse HTML table content and extract plugin information."""
        plugins = []
        rows = self.table_row_pattern.findall(table_content)

        for name_cell, description_cell in rows:
            plugin = self._create_plugin_from_row(
                name_cell, description_cell, category
            )
            if plugin:
                plugins.append(plugin)

        return plugins

    def _create_plugin_from_row(
        self, name_cell: str, description_cell: str, category: str
    ) -> Optional[Plugin]:
        """Create a Plugin object from table row data."""
        name_match = self.link_pattern.search(name_cell)
        if not name_match:
            return None

        github_url = name_match.group(1)
        plugin_name = name_match.group(2).strip()

        if plugin_name.startswith("@"):
            plugin_name = plugin_name[1:]

        description = self.html_tag_pattern.sub("", description_cell).strip()
        icon_match = self.icon_description_pattern.match(description)

        icon = icon_match.group(1) if icon_match else None
        clean_description = icon_match.group(2) if icon_match else description
        clean_description = clean_description.strip()

        if "Name" in plugin_name or "Description" in clean_description:
            return None

        return Plugin(
            name=plugin_name,
            description=clean_description,
            github_url=github_url,
            readme_url=f"{github_url}/README.md",
            category=category,
            icon=icon,
        )

    def _convert_relative_url(self, url: str, github_url: str) -> str:
        """Normalize URLs in README content."""
        if "raw.githubusercontent.com" in url:
            return url

        if "github.com" in url and ("/blob/" in url or "/tree/" in url):
            try:
                parts = url.split("github.com/")[1].split("/")
                if len(parts) >= 5:
                    owner, repo, blob_or_tree, branch, *path = parts
                    return (
                        f"https://raw.githubusercontent.com/{owner}/{repo}/{branch}/"
                        + "/".join(path)
                    )
            except Exception as e:
                logger.warning(f"Failed to normalize blob/tree URL {url}: {e}")
            return url

        if not url.startswith("http"):
            try:
                parts = github_url.strip("/").split("/")
                if "blob" in parts:
                    branch_index = parts.index("blob") + 1
                elif "tree" in parts:
                    branch_index = parts.index("tree") + 1
                else:
                    branch_index = 5

                owner = parts[3]
                repo = parts[4]
                branch = (
                    parts[branch_index] if branch_index < len(parts) else None
                )
                if not branch:
                    try:
                        api_url = (
                            f"https://api.github.com/repos/{owner}/{repo}"
                        )
                        token = os.getenv("GITHUB_TOKEN")
                        headers = {"Accept": "application/vnd.github.v3+json"}
                        if token:
                            headers["Authorization"] = f"Bearer {token}"

                        resp = requests.get(
                            api_url, headers=headers, timeout=5
                        )
                        if resp.status_code == 200:
                            repo_data = resp.json()
                            branch = repo_data.get("default_branch", "main")
                        else:
                            branch = "main"
                    except Exception:
                        branch = "main"

                repo_path = (
                    "/".join(parts[branch_index + 1 :])
                    if branch_index + 1 < len(parts)
                    else ""
                )

                base = f"https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{repo_path}"
                return urljoin(base + "/", url)
            except Exception as e:
                logger.warning(
                    f"Failed to normalize relative URL {url} with {github_url}: {e}"
                )
            return url
        return url

    def _get_content_type(self, url: str) -> Optional[str]:
        """Fetch Content-Type header for a GitHub asset without downloading the file."""
        try:
            resp = requests.head(url, timeout=10, allow_redirects=True)
            if resp.status_code == 200:
                return resp.headers.get("Content-Type", "").lower()
        except Exception as e:
            logger.warning(f"Failed to fetch content type for {url}: {e}")
        return None

    def _extract_image_from_readme(
        self, readme_content: str, github_url: str = ""
    ) -> Optional[str]:
        """Extract image URLs from README content (ignores videos and gifs)."""
        if not readme_content:
            return None

        image_path = None
        banned_exts = (".mp4", ".mov", ".avi")

        markdown_match = self.markdown_img_pattern.search(readme_content)
        if markdown_match:
            url = markdown_match.group(1)
            if not url.lower().endswith(banned_exts):
                return self._convert_relative_url(url, github_url)

        user_match = self.user_attachments_pattern.search(readme_content)
        if user_match:
            url = user_match.group(0)
            ctype = self._get_content_type(url)
            if ctype and ctype.startswith("image/"):
                return url

        github_match = self.github_assets_pattern.search(readme_content)
        if github_match:
            url = github_match.group(0)
            if not url.lower().endswith(banned_exts):
                ctype = self._get_content_type(url)
                if ctype and ctype.startswith("image/"):
                    return self._convert_relative_url(url, github_url)

        img_match = self.html_img_pattern.search(readme_content)
        if img_match:
            url = img_match.group(1)
            if not url.lower().endswith(banned_exts):
                return self._convert_relative_url(url, github_url)

        return image_path

    def _replace_markdown_image(self, match, github_url: str):
        """Replace function for markdown images."""
        alt_text = match.group(1)
        url = match.group(2)
        absolute_url = self._convert_relative_url(url, github_url)
        return f"![{alt_text}]({absolute_url})"

    def _replace_html_image(self, match, github_url: str):
        """Replace function for HTML images."""
        before_src = match.group(1)
        url = match.group(2)
        after_src = match.group(3)
        absolute_url = self._convert_relative_url(url, github_url)
        return f"{before_src}{absolute_url}{after_src}"

    def _replace_bare_github_media(self, match, github_url: str):
        """Replace function for bare GitHub URLs."""
        url = match.group(0)
        absolute_url = self._convert_relative_url(url, github_url)
        return f'<video controls width="100%" style="max-width: 600px; height: auto;"><source src="{absolute_url}" type="video/mp4"></video>'

    def _process_readme_urls(
        self, readme_content: str, github_url: str
    ) -> str:
        """Convert all relative image URLs in README content to absolute URLs."""
        if not readme_content:
            return readme_content

        # Create partial functions with github_url bound
        replace_markdown_image = lambda match: self._replace_markdown_image(
            match, github_url
        )
        replace_html_image = lambda match: self._replace_html_image(
            match, github_url
        )
        replace_bare_github_media = (
            lambda match: self._replace_bare_github_media(match, github_url)
        )

        processed = self.markdown_img_replace_pattern.sub(
            replace_markdown_image, readme_content
        )
        processed = self.html_img_replace_pattern.sub(
            replace_html_image, processed
        )
        processed = self.bare_github_url_pattern.sub(
            replace_bare_github_media, processed
        )

        return processed

    def _get_plugin_sort_key(self, plugin_tuple):
        """Get sort key for plugin tuple based on update date and stars."""
        (
            plugin,
            image,
            repo_info,
            owner,
            repo,
            path,
            plugin_name,
            plugin_slug,
            display_name,
            plugin_link,
        ) = plugin_tuple

        if repo_info and repo_info.get("updated_at"):
            try:
                updated_at = datetime.fromisoformat(
                    repo_info["updated_at"].replace("Z", "+00:00")
                )
                stars = repo_info.get("stars", 0)
                return (-updated_at.timestamp(), -stars)
            except:
                return (0, -repo_info.get("stars", 0))
        return (0, -repo_info.get("stars", 0) if repo_info else 0)

    def generate_plugins_ecosystem_rst(self, all_plugins: List[Plugin]) -> str:
        """Generate the plugins_ecosystem.rst file with all plugin cards."""
        rst_content = ""

        all_plugins_list = []
        fallback_images = [
            "https://cdn.voxel51.com/zoo-predictions.webp",
            "https://cdn.voxel51.com/yolo-predictions.webp",
            "https://cdn.voxel51.com/torchvision-predictions.webp",
            "https://cdn.voxel51.com/mistake-loc.webp",
            "https://cdn.voxel51.com/mistake-missing.webp",
            "https://cdn.sanity.io/images/h6toihm1/production/d286d778ffac5e30c2af62755808bf566dc5d3b6-2048x1148.webp",
        ]

        for plugin in all_plugins:
            try:
                owner, repo, path = self._parse_github_url(plugin.github_url)
            except ValueError as e:
                logger.warning(
                    f"Skipping plugin with invalid URL {plugin.github_url}: {e}"
                )
                continue
            readme_content = self.fetch_github_readme(owner, repo, path)
            if readme_content is None:
                readme_content = ""

            plugin_name = plugin.name.split("/")[-1].replace("`", "").strip()
            plugin_slug = (
                plugin_name.lower().replace("-", "_").replace(" ", "_")
            )
            display_name = " ".join(
                word.capitalize()
                for word in plugin_name.replace("_", " ").split()
            )
            plugin_link = f"plugins_ecosystem/{plugin_name.lower().replace('-', '_').replace(' ', '_')}.html"

            processed_readme = self._process_readme_urls(
                readme_content, plugin.github_url
            )
            processed_readme = self._remove_emojis(processed_readme)

            readme_path = self.plugins_ecosystem_dir / f"{plugin_slug}.md"

            with open(readme_path, "w", encoding="utf-8") as f:
                seo_metadata = self._generate_seo_metadata(
                    plugin, readme_content
                )
                frontmatter = self._generate_frontmatter(seo_metadata)
                github_badge = self._generate_github_badge(plugin)

                if plugin.category == "community":
                    community_note = """```{note}
This is a **community plugin**, an external project maintained by its respective author.
Community plugins are not part of FiftyOne core and may change independently.
Please review each plugin's documentation and license before use.
```

"""
                    f.write(
                        frontmatter
                        + community_note
                        + github_badge
                        + processed_readme
                    )
                else:
                    f.write(frontmatter + github_badge + processed_readme)

            repo_info = self.fetch_github_stars(owner, repo)
            image_path = self._extract_image_from_readme(
                readme_content, plugin.github_url
            )

            all_plugins_list.append(
                (
                    plugin,
                    image_path or None,
                    repo_info,
                    owner,
                    repo,
                    path,
                    plugin_name,
                    plugin_slug,
                    display_name,
                    plugin_link,
                )
            )

        all_plugins_list.sort(key=self._get_plugin_sort_key)

        for idx, (
            plugin,
            cached_image_path,
            repo_info,
            owner,
            repo,
            path,
            plugin_name,
            plugin_slug,
            display_name,
            plugin_link,
        ) in enumerate(all_plugins_list):

            image_path = (
                cached_image_path
                if cached_image_path
                else fallback_images[idx % len(fallback_images)]
            )

            category_tag = plugin.category.title()
            stars = repo_info.get("stars") if repo_info else None

            header_text = (
                f"{display_name} ⭐ {stars}"
                if stars is not None
                else display_name
            )

            author = plugin.name.split("/")[0] if "/" in plugin.name else ""
            author_html = (
                f'<span class="card-subtitle text-muted" style="background-color: #ff6b35; color: white !important; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: 500;">by {author}</span><br/>'
                if author
                else ""
            )
            safe_desc = self._clean_description(plugin.description)
            description_with_author = f"{author_html}{safe_desc}"

            try:
                branch = (repo_info or {}).get("default_branch") or "main"
                init_rel_path = (
                    f"{path}/__init__.py" if path else "__init__.py"
                )
                raw_init_url = f"https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{init_rel_path}"
                init_resp = requests.get(raw_init_url, timeout=6)
                if init_resp.status_code == 200:
                    init_text = init_resp.text or ""
                    has_model = (
                        self.download_model_pattern.search(init_text)
                        is not None
                    )
                    has_dataset = (
                        self.load_dataset_pattern.search(init_text) is not None
                    )
                else:
                    has_model = False
                    has_dataset = False
            except Exception as e:
                logger.warning(
                    f"Error checking for model and dataset in {plugin.github_url}: {e}"
                )
                has_model = False
                has_dataset = False

            if has_model:
                models = self._fetch_plugin_manifest(owner, repo, path, branch)
                if models:
                    github_url = f"https://github.com/{owner}/{repo}"
                    if path:
                        github_url += f"/tree/{branch}/{path}"
                    self._generate_plugin_model_docs(
                        models, plugin_name, plugin_link, github_url
                    )

            extra_tags = [
                tag
                for tag, condition in [
                    ("Model", has_model),
                    ("Dataset", has_dataset),
                ]
                if condition
            ]
            tags_field = ",".join([category_tag] + extra_tags)

            rst_content += f"""
.. customcarditem::
    :header: {header_text}
    :description: {description_with_author}
    :link: {plugin_link}
    :image: {image_path}
    :tags: {tags_field}

"""
        return rst_content

    def generate_all_docs(self, readme_content: str):
        """Generate all plugin documentation."""
        plugins = self.extract_plugins_from_readme(readme_content)
        if not plugins:
            logger.warning("No plugins found in README content")
            return

        logger.info(f"Found {len(plugins)} plugins")

        plugins_ecosystem_content = self.generate_plugins_ecosystem_rst(
            plugins
        )
        with open(self.plugins_ecosystem_dir / "plugin_cards.rst", "w") as f:
            f.write(plugins_ecosystem_content)

        cards_path = self.models_dir / "plugin_model_cards.rst"
        with open(cards_path, "w", encoding="utf-8") as f:
            f.write("\n".join(self._plugin_model_cards))
        if self._plugin_model_cards:
            logger.info(
                f"Generated {len(self._plugin_model_cards)} plugin model cards"
            )

        logger.info("Plugin documentation generated successfully!")


def main():
    """Main function to generate plugin documentation."""
    docs_source = os.path.join(os.path.dirname(__file__), "..", "source")
    generator = PluginDocGenerator(docs_source)
    readme_url = "https://raw.githubusercontent.com/voxel51/fiftyone-plugins/main/README.md"

    try:
        logger.info(f"Fetching README from: {readme_url}")
        response = requests.get(readme_url, timeout=10)
        if response.status_code == 200:
            readme_content = response.text
            generator.generate_all_docs(readme_content)
            logger.info("Plugin documentation generated successfully!")
        else:
            logger.error(f"Failed to fetch README: {response.status_code}")
    except Exception as e:
        logger.error(f"Error generating plugin documentation: {e}")


if __name__ == "__main__":
    main()
