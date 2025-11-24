"""
Sphinx extension for generating llms.txt from documentation.
"""

import os
from sphinx.application import Sphinx
from sphinx.util import logging


class LLMSTxtGenerator:
    def __init__(self, app: Sphinx):
        self.app = app
        self.collected_pages = []
        self.logger = logging.getLogger(__name__)

    def get_page_title(self, toc_entry, current_doc, sphinx_env, target_doc):
        title = toc_entry[0]
        if not title:
            title_element = sphinx_env.titles.get(target_doc)
            title = (
                title_element.astext()
                if title_element
                else target_doc.split("/")[-1]
            )
        return title.strip() if title else ""

    def get_page_description(self, target_doc, sphinx_env):
        try:
            doc_tree = sphinx_env.get_doctree(target_doc)
            for node in doc_tree.traverse():
                if (
                    node.__class__.__name__ == "meta"
                    and node.get("name") == "description"
                ):
                    return node.get("content", "")
        except Exception:
            self.logger.debug(f"Failed to get description for {target_doc}")
        return ""

    def scan_document_structure(
        self, doc_name, sphinx_env, parent_section=None, nesting_level=0
    ):
        try:
            document_tree = sphinx_env.get_doctree(doc_name)
        except Exception:
            self.logger.debug(f"Failed to get doctree for {doc_name}")
            return

        if not document_tree:
            return

        current_title = None
        title_element = sphinx_env.titles.get(doc_name)
        if title_element:
            current_title = title_element.astext()

        for node in document_tree.traverse():
            if node.__class__.__name__ != "toctree":
                continue

            for entry in node.attributes.get("entries", []):
                target = entry[1]
                resolved = target if target != "self" else doc_name
                external = target.startswith(("http://", "https://"))

                title = self.get_page_title(
                    entry, doc_name, sphinx_env, resolved
                )
                desc = (
                    ""
                    if external
                    else self.get_page_description(resolved, sphinx_env)
                )

                if (
                    doc_name == sphinx_env.config.master_doc
                    and resolved == sphinx_env.config.master_doc
                ):
                    continue

                if parent_section:
                    section = parent_section
                elif doc_name == sphinx_env.config.master_doc:
                    if not external:
                        target_title = sphinx_env.titles.get(resolved)
                        section = (
                            target_title.astext() if target_title else None
                        )
                    else:
                        section = None
                else:
                    section = current_title

                self.collected_pages.append(
                    (resolved, title, external, section, desc, nesting_level)
                )

                if not external and target != "self":
                    self.scan_document_structure(
                        resolved, sphinx_env, section, nesting_level + 1
                    )

    def collect_toctree_entries(self, app, env):
        self.collected_pages = []
        self.scan_document_structure(env.config.master_doc, env, None, 0)

    def group_pages_by_section(self):
        processed = set()
        sections = {}

        for (
            path,
            title,
            external,
            section,
            desc,
            level,
        ) in self.collected_pages:
            url = (
                path
                if external
                else f"{self.app.config.llms_txt_base_url.rstrip('/')}/{path}.md"
            )

            if url in processed:
                continue

            section = section or "Uncategorized"
            indent = "  " * level
            entry = (
                f"{indent}- [{title}]({url}): {desc}"
                if desc
                else f"{indent}- [{title}]({url})"
            )

            if section not in sections:
                sections[section] = []
            sections[section].append(entry)
            processed.add(url)

        return sections

    def generate_llms_txt_file(self, app, exception):
        if exception:
            return

        sections = self.group_pages_by_section()
        lines = [f"# {self.app.config.llms_txt_title}", ""]

        if self.app.config.llms_txt_description:
            lines.extend([self.app.config.llms_txt_description, ""])

        for title, entries in sections.items():
            lines.extend([f"## {title}", ""] + entries + [""])

        if self.app.config.llms_txt_optional:
            lines.extend(
                ["## Optional", "", self.app.config.llms_txt_optional, ""]
            )

        try:
            with open(
                os.path.join(self.app.outdir, "llms.txt"),
                "w",
                encoding="utf-8",
            ) as f:
                f.write("\n".join(lines))
            self.logger.info("llms.txt generated successfully")
        except Exception as e:
            self.logger.error("llms.txt generation failed: %s", str(e))


def setup(app: Sphinx):
    app.add_config_value("llms_txt_title", "FiftyOne documentation", "env")
    app.add_config_value(
        "llms_txt_description",
        "> FiftyOne is an open-source tool for building high-quality datasets and computer vision models.\n"
        "It supercharges machine learning workflows by enabling you to visualize datasets, interpret models, evaluate performance, and identify data quality issues faster and more effectively.\n"
        "The platform provides powerful capabilities for dataset curation, model evaluation, annotation mistake detection, and integrates seamlessly with popular ML tools like PyTorch, TensorFlow, Hugging Face, and more.",
        "env",
    )
    app.add_config_value(
        "llms_txt_base_url", "https://docs.voxel51.com/", "env"
    )
    app.add_config_value(
        "llms_txt_optional", "- [All docs](https://docs.voxel51.com/)", "env"
    )

    generator = LLMSTxtGenerator(app)
    app.connect("env-updated", generator.collect_toctree_entries)
    app.connect("build-finished", generator.generate_llms_txt_file)

    return {"version": "0.1", "parallel_read_safe": True}
