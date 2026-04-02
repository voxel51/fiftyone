"""
FiftyOne plugin skills.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging
import os
import shutil

import yaml

_LOCAL_TARGETS = {
    "claude": os.path.join(".claude", "skills"),
    "codex": os.path.join(".codex", "skills"),
    "cursor": os.path.join(".cursor", "skills"),
    "opencode": os.path.join(".opencode", "skills"),
}

_GLOBAL_TARGETS = {
    "claude": os.path.join("~", ".claude", "skills"),
    "codex": os.path.join("~", ".codex", "skills"),
    "cursor": os.path.join("~", ".cursor", "skills"),
    "opencode": os.path.join("~", ".config", "opencode", "skills"),
}

_CENTRAL_LOCAL = os.path.join(".agents", "skills")
_CENTRAL_GLOBAL = os.path.join("~", ".agents", "skills")

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
        with open(self._path, "r") as f:
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
        try:
            for skill in _iter_plugin_skills(pd):
                if category is not None and skill.category not in category:
                    continue
                skills.append(skill)
        except:
            logger.info(f"Failed to load skills from plugin '{pd.name}'")

    return skills


def install_skills(agents, plugin=None, global_=False):
    """Installs skills from installed plugins to AI agent directories.

    A central copy of each skill is written to
    ``.agents/skills/<skill-name>/`` (or ``~/.agents/skills/<skill-name>/``
    when ``global_=True``) and a relative symlink is created in each
    requested agent's skills directory.

    Args:
        agents: an agent name or list of agent names. Supported agents are
            ``"claude"``, ``"codex"``, ``"cursor"``, and ``"opencode"``
        plugin (None): a plugin name or list of plugin names to include.
            By default, skills from all plugins are installed
        global_ (False): whether to install to global user-level
            directories (``~/``) rather than local project-level
            directories

    Returns:
        a list of installed skill names
    """
    if isinstance(agents, str):
        agents = [agents]

    targets = _GLOBAL_TARGETS if global_ else _LOCAL_TARGETS
    unknown = [a for a in agents if a not in targets]
    if unknown:
        raise ValueError(
            f"Unsupported agent(s) {unknown}. Supported agents are: "
            f"{sorted(targets.keys())}"
        )

    skills = list_skills(plugin=plugin)
    if not skills:
        logger.info("No skills found")
        return []

    central_base = _CENTRAL_GLOBAL if global_ else _CENTRAL_LOCAL
    central_dir = os.path.realpath(os.path.expanduser(central_base))

    installed = []

    for skill in skills:
        if (
            not skill.name
            or os.path.basename(skill.name) != skill.name
            or skill.name in (".", "..")
        ):
            raise ValueError(f"Invalid skill name: {skill.name!r}")

        skill_central = os.path.join(central_dir, skill.name)
        os.makedirs(skill_central, exist_ok=True)

        dest = os.path.join(skill_central, os.path.basename(skill.path))
        shutil.copy2(skill.path, dest)
        logger.info(f"Copied skill '{skill.name}' to '{skill_central}'")

        for agent in agents:
            agent_skills_dir = os.path.realpath(
                os.path.expanduser(targets[agent])
            )
            os.makedirs(agent_skills_dir, exist_ok=True)

            link_path = os.path.join(agent_skills_dir, skill.name)
            if os.path.islink(link_path):
                os.unlink(link_path)
            elif os.path.isdir(link_path):
                shutil.rmtree(link_path)

            rel_target = os.path.relpath(skill_central, agent_skills_dir)
            os.symlink(rel_target, link_path)
            logger.info(f"Created symlink '{link_path}' -> '{rel_target}'")

        installed.append(skill.name)

    return installed


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
    with open(skill_path, "r") as f:
        content = f.read()

    if not content.startswith("---"):
        return {}

    parts = content.split("---", 2)
    if len(parts) < 3:
        return {}

    try:
        return yaml.safe_load(parts[1]) or {}
    except yaml.YAMLError:
        return {}
