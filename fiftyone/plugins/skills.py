"""
FiftyOne plugin skills.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging
import os
import re

import yaml

logger = logging.getLogger(__name__)


class SkillDefinition(object):
    """A skill definition.

    Args:
        path: the absolute path to the skill's Markdown file
        metadata: a skill metadata dict parsed from the file's YAML
            frontmatter
        plugin_name: the name of the plugin that provides this skill
    """

    def __init__(self, path, metadata, plugin_name):
        self._path = path
        self._metadata = metadata
        self._plugin_name = plugin_name

    @property
    def name(self):
        """The name of the skill."""
        return self._metadata.get(
            "name",
            os.path.basename(os.path.dirname(self._path)),
        )

    @property
    def description(self):
        """The description of the skill."""
        return self._metadata.get("description", "")

    @property
    def category(self):
        """The category of the skill."""
        return self._metadata.get("category", "")

    @property
    def path(self):
        """The absolute path to the skill file."""
        return self._path

    @property
    def plugin_name(self):
        """The name of the plugin that provides this skill."""
        return self._plugin_name

    @property
    def content(self):
        """The full raw content of the skill file."""
        with open(self._path, "r", encoding="utf-8") as f:
            return f.read()

    def to_dict(self):
        """Returns a JSON dict representation of the skill.

        Returns:
            a JSON dict
        """
        return {
            "name": self.name,
            "description": self.description,
            "category": self.category,
            "path": self.path,
            "plugin": self.plugin_name,
        }


def list_skills(enabled=True, plugin=None, category=None):
    """Lists available skills from installed plugins.

    Args:
        enabled (True): whether to include only enabled plugins (True),
            only disabled plugins (False), or all plugins (``"all"``)
        plugin (None): a plugin name or list of plugin names to include.
            By default, skills from all plugins are included
        category (None): a category or list of categories to filter by.
            By default, skills of all categories are included

    Returns:
        a list of :class:`SkillDefinition` instances
    """
    import fiftyone.plugins as fop

    plugin_defs = fop.list_plugins(enabled=enabled, builtin="all")

    if plugin is not None:
        plugin = {plugin} if isinstance(plugin, str) else set(plugin)
        plugin_defs = [p for p in plugin_defs if p.name in plugin]

    if category is not None:
        category = {category} if isinstance(category, str) else set(category)

    skills = []
    for pd in plugin_defs:
        for skill in _iter_plugin_skills(pd):
            try:
                if category is not None and skill.category not in category:
                    continue
                skills.append(skill)
            except:
                logger.info(f"Failed to load skill from plugin '{pd.name}'")

    return skills


def _iter_plugin_skills(plugin_definition):
    plugin_dir = os.path.realpath(plugin_definition.directory)
    for rel_path in plugin_definition.skills:
        skill_path = os.path.realpath(os.path.join(plugin_dir, rel_path))
        try:
            outside = (
                os.path.commonpath([plugin_dir, skill_path]) != plugin_dir
            )
        except ValueError:
            outside = True

        if outside:
            logger.warning(
                "Ignoring skill path outside plugin directory: %s", rel_path
            )
            continue

        if not os.path.isfile(skill_path):
            logger.debug(f"Skill file not found: '{skill_path}'")
            continue

        metadata = _parse_skill_frontmatter(skill_path)
        yield SkillDefinition(skill_path, metadata, plugin_definition.name)


def _parse_skill_frontmatter(skill_path):
    with open(skill_path, "r", encoding="utf-8") as f:
        content = f.read()

    parts = re.split(r"^---\s*$", content, maxsplit=2, flags=re.MULTILINE)
    if len(parts) < 3:
        return {}

    try:
        result = yaml.safe_load(parts[1])
        return result if isinstance(result, dict) else {}
    except yaml.YAMLError:
        return {}
