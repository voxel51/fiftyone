#!/usr/bin/env python3
"""
Script for generating plugin documentation dynamically from the FiftyOne plugins repository.

| Copyright 2017-2025, Voxel51, Inc.
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

    def _remove_emojis(self, text: str) -> str:
        """Remove emoji and miscellaneous symbols from a string.

        This targets common Unicode emoji blocks and symbol ranges while leaving
        standard ASCII and most typical punctuation intact.
        """
        if not text:
            return text

        emoji_pattern = re.compile(
            r"[\U0001F300-\U0001FAFF\U00002702-\U000027B0\U000024C2-\U0001F251\u2600-\u26FF\u2700-\u27BF]",
            flags=re.UNICODE,
        )
        return emoji_pattern.sub("", text)

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
        pattern = rf"## {re.escape(section_name)}\s*\n\n(.*?)(?=\n## |\n$)"
        match = re.search(pattern, content, re.DOTALL)
        return match.group(1) if match else None

    def _parse_html_table(
        self, table_content: str, category: str
    ) -> List[Plugin]:
        """Parse HTML table content and extract plugin information."""
        plugins = []
        row_pattern = (
            r"<tr>\s*<td[^>]*>(.*?)</td>\s*<td[^>]*>(.*?)</td>\s*</tr>"
        )
        rows = re.findall(row_pattern, table_content, re.DOTALL)

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
        name_match = re.search(
            r'<a[^>]*href="([^"]*)"[^>]*>([^<]*)</a>', name_cell
        )
        if not name_match:
            return None

        github_url = name_match.group(1)
        plugin_name = name_match.group(2).strip()

        if plugin_name.startswith("@"):
            plugin_name = plugin_name[1:]

        description = re.sub(r"<[^>]+>", "", description_cell).strip()
        icon_match = re.match(r"^([^\s]+)\s*(.+)", description)

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
        markdown_img_pattern = r"!\[[^\]]*\]\(([^)]+)\)"
        markdown_match = re.search(markdown_img_pattern, readme_content)
        if markdown_match:
            url = markdown_match.group(1)
            if not url.lower().endswith(banned_exts):
                return self._convert_relative_url(url, github_url)

        user_attachments_pattern = (
            r"https://github\.com/user-attachments/assets/[a-f0-9-]+"
        )
        user_match = re.search(user_attachments_pattern, readme_content)
        if user_match:
            url = user_match.group(0)
            ctype = self._get_content_type(url)
            if ctype and ctype.startswith("image/"):
                return url
            else:
                return None

        github_assets_pattern = (
            r"https://github\.com/[^/]+/[^/]+/assets/\d+/[a-f0-9-]+"
        )
        github_match = re.search(github_assets_pattern, readme_content)
        if github_match:
            url = github_match.group(0)
            if not url.lower().endswith(banned_exts):
                ctype = self._get_content_type(url)
                if ctype and ctype.startswith("image/"):
                    return self._convert_relative_url(url, github_url)

        img_pattern = r'<img[^>]+src=["\']([^"\']+)["\'][^>]*>'
        img_match = re.search(img_pattern, readme_content)
        if img_match:
            url = img_match.group(1)
            if not url.lower().endswith(banned_exts):
                return self._convert_relative_url(url, github_url)

        return image_path

    def _process_readme_urls(
        self, readme_content: str, github_url: str
    ) -> str:
        """Convert all relative image URLs in README content to absolute URLs."""
        if not readme_content:
            return readme_content

        def replace_markdown_image(match):
            alt_text = match.group(1)
            url = match.group(2)
            absolute_url = self._convert_relative_url(url, github_url)
            return f"![{alt_text}]({absolute_url})"

        def replace_html_image(match):
            before_src = match.group(1)
            url = match.group(2)
            after_src = match.group(3)
            absolute_url = self._convert_relative_url(url, github_url)
            return f"{before_src}{absolute_url}{after_src}"

        processed = re.sub(
            r"!\[([^\]]*)\]\(([^)]+)\)", replace_markdown_image, readme_content
        )
        processed = re.sub(
            r'(<img[^>]+src=["\'])([^"\']+)(["\'][^>]*>)',
            replace_html_image,
            processed,
        )

        return processed

    def _get_plugin_sort_key(self, plugin_tuple):
        """Get sort key for plugin tuple based on update date and stars."""
        plugin, image, repo_info = plugin_tuple

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
        rst_content = """.. _plugins-ecosystem:

Plugins Ecosystem
============================

.. default-role:: code

Welcome to the FiftyOne Plugins ecosystem! 🚀

Discover cutting-edge research, state-of-the-art models, and innovative techniques. These plugins extend the power of FiftyOne beyond imagination. From advanced computer vision models to specialized annotation tools, our curated collection transforms FiftyOne into your ultimate AI research platform.

.. raw:: html

    <div class="plugins-search-container">
        <div class="plugins-search-box">
            <input type="text" id="plugin-search" placeholder="Search plugins by name, description, author, or category...">
            <div class="plugins-search-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="11" cy="11" r="8"></circle>
                    <path d="m21 21-4.35-4.35"></path>
                </svg>
            </div>
        </div>
    </div>

.. raw:: html

    <div style="margin:0; width: 100%; display:flex; justify-content:flex-end;">
        <a href="https://github.com/voxel51/fiftyone-plugins?tab=readme-ov-file#contributing" target="_blank" class="sd-btn sd-btn-primary book-a-demo plugins-cta" rel="noopener noreferrer">
            <div class="arrow">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="size-3">
                <path stroke="currentColor" stroke-width="1.5"
                        d="M1.458 11.995h20.125M11.52 22.063 21.584 12 11.521 1.937"
                        vector-effect="non-scaling-stroke"></path>
                </svg>  
            </div>
            <div class="text">Build your own plugin</div>
        </a>
    </div>
    
.. Plugins cards section -----------------------------------------------------

.. raw:: html

    <div id="plugin-cards-container">

    <nav class="navbar navbar-expand-lg navbar-light tutorials-nav col-12">
        <div class="tutorial-tags-container">
            <div id="dropdown-filter-tags">
                <div class="tutorial-filter-menu">
                    <div class="tutorial-filter filter-btn all-tag-selected" data-tag="all">All</div>
                </div>
            </div>
        </nav>
        
    <hr class="tutorials-hr">

    <div class="row">

    <div id="tutorial-cards">
    <div class="list">

.. Add plugin cards below

"""

        plugins_with_info = []
        fallback_images = [
            "https://cdn.voxel51.com/zoo-predictions.webp",
            "https://cdn.voxel51.com/yolo-predictions.webp",
            "https://cdn.voxel51.com/torchvision-predictions.webp",
            "https://cdn.voxel51.com/mistake-loc.webp",
            "https://cdn.voxel51.com/mistake-missing.webp",
            "https://cdn.sanity.io/images/h6toihm1/production/d286d778ffac5e30c2af62755808bf566dc5d3b6-2048x1148.webp",
        ]

        for plugin in all_plugins:
            owner, repo, path = self._parse_github_url(plugin.github_url)
            readme_content = self.fetch_github_readme(owner, repo, path)

            if readme_content is None:
                continue

            plugin_name = plugin.name.split("/")[-1].replace("`", "").strip()
            plugin_slug = (
                plugin_name.lower().replace("-", "_").replace(" ", "_")
            )

            processed_readme = self._process_readme_urls(
                readme_content, plugin.github_url
            )
            processed_readme = self._remove_emojis(processed_readme)

            readme_path = self.plugins_ecosystem_dir / f"{plugin_slug}.md"

            with open(readme_path, "w", encoding="utf-8") as f:
                if plugin.category == "community":
                    community_note = """> **Note**
> 
> Community plugins are external projects maintained by their respective authors. They are not
> part of FiftyOne core and may change independently. Review each plugin's documentation and
> license before use.

"""
                    f.write(community_note + processed_readme)
                else:
                    f.write(processed_readme)

            repo_info = self.fetch_github_stars(owner, repo)
            image_path = self._extract_image_from_readme(
                readme_content, plugin.github_url
            )

            plugins_with_info.append((plugin, image_path or None, repo_info))

        plugins_with_info.sort(key=self._get_plugin_sort_key)
        all_plugins_list = plugins_with_info

        for idx, (plugin, cached_image_path, repo_info) in enumerate(
            all_plugins_list
        ):
            plugin_name = plugin.name.split("/")[-1].replace("`", "").strip()
            display_name = " ".join(
                word.capitalize()
                for word in plugin_name.replace("_", " ").split()
            )
            plugin_link = f"plugins_ecosystem/{plugin_name.lower().replace('-', '_').replace(' ', '_')}.html"

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
            safe_desc = plugin.description.replace("\n", " ").replace(
                ":", "\\:"
            )
            description_with_author = f"{author_html}{safe_desc}"

            try:
                owner, repo, subpath = self._parse_github_url(
                    plugin.github_url
                )
                branch = (repo_info or {}).get("default_branch") or "main"
                init_rel_path = (
                    f"{subpath}/__init__.py" if subpath else "__init__.py"
                )
                raw_init_url = f"https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{init_rel_path}"
                init_resp = requests.get(raw_init_url, timeout=6)
                has_model = False
                has_dataset = False
                if init_resp.status_code == 200:
                    init_text = init_resp.text or ""
                    has_model = (
                        re.search(r"\bdef\s+download_model\s*\(", init_text)
                        is not None
                    )
                    has_dataset = (
                        re.search(r"\bdef\s+load_dataset\s*\(", init_text)
                        is not None
                    )
            except Exception as e:
                logger.warning(
                    f"Error checking for model and dataset in {plugin.github_url}: {e}"
                )
                has_model = False
                has_dataset = False

            extra_tags = []
            if has_model:
                extra_tags.append("Model")
            if has_dataset:
                extra_tags.append("Dataset")
            tags_field = ",".join(
                [t for t in [category_tag] + extra_tags if t]
            )

            rst_content += f"""
.. customcarditem::
    :header: {header_text}
    :description: {description_with_author}
    :link: {plugin_link}
    :image: {image_path}
    :tags: {tags_field}

"""

        rst_content += """
.. End of plugin cards

.. raw:: html

    </div>

    <div class="pagination d-flex justify-content-center"></div>

    </div>

    </div>

    

.. End plugins cards section -------------------------------------------------

.. note::
   Community plugins are external projects maintained by their respective authors. They are not
   part of FiftyOne core and may change independently. Review each plugin's documentation and
   license before use.

.. toctree::
   :maxdepth: 1
   :hidden:
   :glob:

   Overview <index>
   Using plugins <using_plugins>
   Developing plugins <developing_plugins>
   plugins_ecosystem/*
   API reference <api/plugins>
   TypeScript API reference <ts-api>

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
        with open(self.plugins_dir / "plugin_cards.rst", "w") as f:
            f.write(plugins_ecosystem_content)

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
