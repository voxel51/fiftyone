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
from typing import List, Optional
from dataclasses import dataclass
from urllib.parse import urlparse, urljoin

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

    def _parse_github_url(self, github_url: str):
        """
        Parse a GitHub URL and return (owner, repo, path).
        Handles repo root, folder URLs, and direct file URLs.
        """
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
        """
        Fetch README from GitHub (root or subfolder).
        Use API for root, raw.githubusercontent for subfolders.
        """
        token = os.getenv("GITHUB_TOKEN")
        headers = {"Accept": "application/vnd.github.v3.raw"}
        if token:
            headers["Authorization"] = f"Bearer {token}"

        if not path:
            url = f"https://api.github.com/repos/{owner}/{repo}/readme"
            try:
                resp = requests.get(url, headers=headers, timeout=10)
                resp.raise_for_status()
                return resp.text
            except Exception as e:
                logger.warning(f"Failed to fetch root README via API: {e}")
                raw_url = f"https://raw.githubusercontent.com/{owner}/{repo}/main/README.md"
                try:
                    return requests.get(raw_url, timeout=10).text
                except Exception as e2:
                    logger.error(f"Failed raw fallback {raw_url}: {e2}")
                    return ""

        raw_url = f"https://raw.githubusercontent.com/{owner}/{repo}/main/{path}/README.md"
        try:
            resp = requests.get(raw_url, timeout=10)
            resp.raise_for_status()
            return resp.text
        except Exception as e:
            logger.error(
                f"Failed to fetch subfolder README from {raw_url}: {e}"
            )
            return ""

    def fetch_github_stars(self, owner: str, repo: str) -> Optional[int]:
        """Fetch stargazers count for a GitHub repository."""
        try:
            token = os.getenv("GITHUB_TOKEN")
            headers = {"Accept": "application/vnd.github.v3+json"}
            if token:
                headers["Authorization"] = f"Bearer {token}"
            api_url = f"https://api.github.com/repos/{owner}/{repo}"
            resp = requests.get(api_url, headers=headers, timeout=8)
            if resp.status_code == 200:
                data = resp.json()
                return int(data.get("stargazers_count", 0))
            logger.warning(
                f"Failed to fetch stars for {owner}/{repo}: {resp.status_code}"
            )
        except Exception as e:
            logger.warning(f"Error fetching stars for {owner}/{repo}: {e}")
        return None

    def extract_plugins_from_readme(self, readme_content: str) -> List[Plugin]:
        """Extract plugin information from the README content."""
        plugins = []

        community_section = self._extract_table_section(
            readme_content, "Community Plugins"
        )
        if community_section:
            plugins.extend(
                self._parse_html_table(community_section, "community")
            )

        core_section = self._extract_table_section(
            readme_content, "Core Plugins"
        )
        if core_section:
            plugins.extend(self._parse_html_table(core_section, "core"))

        voxel51_section = self._extract_table_section(
            readme_content, "Voxel51 Plugins"
        )
        if voxel51_section:
            plugins.extend(self._parse_html_table(voxel51_section, "voxel51"))

        return plugins

    def _extract_table_section(
        self, content: str, section_name: str
    ) -> Optional[str]:
        """Extract a table section from the README content."""
        pattern = rf"## {re.escape(section_name)}\s*\n\n(.*?)(?=\n## |\n$)"
        match = re.search(pattern, content, re.DOTALL)
        if match:
            return match.group(1)
        return None

    def _parse_html_table(
        self, table_content: str, category: str
    ) -> List[Plugin]:
        """Parse HTML table content and extract plugin information."""
        plugins = []
        row_pattern = (
            r"<tr>\s*<td[^>]*>(.*?)</td>\s*<td[^>]*>(.*?)</td>\s*</tr>"
        )
        rows = re.findall(row_pattern, table_content, re.DOTALL)

        for row in rows:
            if len(row) != 2:
                continue

            name_cell, description_cell = row
            name_match = re.search(
                r'<a[^>]*href="([^"]*)"[^>]*>([^<]*)</a>', name_cell
            )
            if not name_match:
                continue

            github_url = name_match.group(1)
            plugin_name = name_match.group(2).strip()

            if plugin_name.startswith("@"):
                plugin_name = plugin_name[1:]

            description = re.sub(r"<[^>]+>", "", description_cell).strip()
            icon_match = re.match(r"^([^\s]+)\s*(.+)", description)
            icon = icon_match.group(1) if icon_match else None
            clean_description = (
                icon_match.group(2) if icon_match else description
            )

            clean_description = clean_description.strip()

            if "Name" in plugin_name or "Description" in clean_description:
                continue

            plugin = Plugin(
                name=plugin_name,
                description=clean_description,
                github_url=github_url,
                readme_url=f"{github_url}/README.md",
                category=category,
                icon=icon,
            )
            plugins.append(plugin)

        return plugins

    def _convert_relative_url(self, url: str, github_url: str) -> str:
        """
        Normalize URLs in README:
        - Return raw URLs unchanged
        - Convert blob/tree URLs to raw.githubusercontent.com
        - Convert relative paths (./foo.png) to raw paths based on github_url
        """
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

    def generate_plugins_ecosystem_rst(self, all_plugins: List[Plugin]) -> str:
        """Generate the plugins_ecosystem.rst file with all plugin cards."""
        rst_content = """.. _plugins-ecosystem:

Plugins Ecosystem
============================

.. default-role:: code

Welcome to the FiftyOne Plugins ecosystem! 🚀

Discover cutting-edge research, state-of-the-art models, and innovative techniques. These plugins extend the power of FiftyOne beyond imagination. From advanced computer vision models to specialized annotation tools, our curated collection transforms FiftyOne into your ultimate AI research platform.

Explore the latest breakthroughs and enhance your workflows with these powerful plugins from the
`FiftyOne Plugins <https://github.com/voxel51/fiftyone-plugins>`_ repository:

.. note::
   Community plugins are external projects maintained by their respective authors. They are not
   part of FiftyOne core and may change independently. Review each plugin's documentation and
   license before use.

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
        plugins_with_images = []
        plugins_without_images = []

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

            readme_path = self.plugins_ecosystem_dir / f"{plugin_slug}.md"
            with open(readme_path, "w", encoding="utf-8") as f:
                f.write(processed_readme)

            image_path = self._extract_image_from_readme(
                readme_content, plugin.github_url
            )
            (
                plugins_with_images if image_path else plugins_without_images
            ).append((plugin, image_path or None))

        all_plugins_list = plugins_with_images + plugins_without_images

        logger.info(
            f"Found {len(plugins_with_images)} plugins with images and {len(plugins_without_images)} without images"
        )

        for plugin, cached_image_path in all_plugins_list:
            plugin_name = plugin.name.split("/")[-1].replace("`", "").strip()
            display_name = " ".join(
                word.capitalize()
                for word in plugin_name.replace("_", " ").split()
            )
            plugin_link = f"{plugin_name.lower().replace('-', '_').replace(' ', '_')}.html"

            image_path = (
                cached_image_path
                if cached_image_path
                else "https://cdn.sanity.io/images/h6toihm1/production/7eddaa11e4fe94c99f1b4072053db599dca64cdd-1920x1080.png"
            )

            category_tag = plugin.category.title()

            try:
                owner, repo, _ = self._parse_github_url(plugin.github_url)
                stars = self.fetch_github_stars(owner, repo)
            except Exception:
                stars = None
            header_text = (
                f"{display_name} ⭐ {stars}"
                if stars is not None
                else f"{display_name}"
            )

            rst_content += f"""
.. customcarditem::
    :header: {header_text}
    :description: {plugin.description}
    :link: {plugin_link}
    :image: {image_path}
    :tags: {category_tag}

"""

        rst_content += """
.. End of plugin cards

.. raw:: html

    </div>

    <div class="pagination d-flex justify-content-center"></div>

    </div>

    </div>

.. End plugins cards section -------------------------------------------------

.. toctree::
   :maxdepth: 1
   :hidden:

"""

        for plugin_tuple in all_plugins_list:
            plugin = plugin_tuple[0]
            plugin_name = plugin.name.split("/")[-1].replace("`", "").strip()
            plugin_slug = (
                plugin_name.lower().replace("-", "_").replace(" ", "_")
            )
            filename = f"{plugin_slug}.md"
            rst_content += f"   {plugin_name} <{filename}>\n"

        rst_content += """

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
        with open(self.plugins_ecosystem_dir / "index.rst", "w") as f:
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
