"""
FiftyOne plugin skills tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import json
import os
from unittest import mock

import pytest

import fiftyone.plugins as fop
import fiftyone.plugins.skills as fps


_DEFAULT_APP_CONFIG = {}

_SKILL_MD = """\
---
name: {name}
description: A test skill
category: {category}
---
# {name}
"""

_PLUGIN_YML = """\
name: {plugin}
version: 1.0.0
skills:
  - skills/{skill}/SKILL.md
"""

_PLUGIN_YML_NO_SKILLS = """\
name: {plugin}
version: 1.0.0
"""


@pytest.fixture(autouse=True, scope="function")
def app_config_path(tmp_path_factory):
    fn = tmp_path_factory.mktemp(".fiftyone") / "app_config.json"
    with open(fn, "w") as f:
        f.write(json.dumps(_DEFAULT_APP_CONFIG))
    return str(fn)


@pytest.fixture(autouse=True)
def mock_app_config_env_var(app_config_path):
    with mock.patch.dict(
        os.environ, {"FIFTYONE_APP_CONFIG_PATH": app_config_path}
    ):
        yield


@pytest.fixture(autouse=True, scope="function")
def plugins_dir(tmp_path_factory):
    return tmp_path_factory.mktemp("fiftyone-plugins")


def _make_plugin(plugins_dir, plugin_name, skill_name, category="general"):
    skill_dir = os.path.join(plugins_dir, plugin_name, "skills", skill_name)
    os.makedirs(skill_dir, exist_ok=True)

    with open(
        os.path.join(plugins_dir, plugin_name, "fiftyone.yml"), "w"
    ) as f:
        f.write(_PLUGIN_YML.format(plugin=plugin_name, skill=skill_name))

    with open(os.path.join(skill_dir, "SKILL.md"), "w") as f:
        f.write(_SKILL_MD.format(name=skill_name, category=category))


def _make_plugin_no_skills(plugins_dir, plugin_name):
    plugin_dir = os.path.join(plugins_dir, plugin_name)
    os.makedirs(plugin_dir, exist_ok=True)

    with open(os.path.join(plugin_dir, "fiftyone.yml"), "w") as f:
        f.write(_PLUGIN_YML_NO_SKILLS.format(plugin=plugin_name))


def test_list_skills(mocker, plugins_dir):
    _make_plugin(plugins_dir, "plugin-a", "skill-a")
    mocker.patch("fiftyone.config.plugins_dir", plugins_dir)

    skills = fop.list_skills()

    assert len(skills) == 1
    assert skills[0].name == "skill-a"
    assert skills[0].plugin_name == "plugin-a"


def test_list_skills_disabled_plugin(mocker, plugins_dir):
    _make_plugin(plugins_dir, "plugin-a", "skill-a")
    mocker.patch("fiftyone.config.plugins_dir", plugins_dir)
    fop.disable_plugin("plugin-a")

    assert fop.list_skills() == []


def test_list_skills_filter_plugin(mocker, plugins_dir):
    _make_plugin(plugins_dir, "plugin-a", "skill-a")
    _make_plugin(plugins_dir, "plugin-b", "skill-b")
    mocker.patch("fiftyone.config.plugins_dir", plugins_dir)

    skills = fop.list_skills(plugin="plugin-a")

    assert len(skills) == 1
    assert skills[0].plugin_name == "plugin-a"


def test_list_skills_filter_category(mocker, plugins_dir):
    _make_plugin(plugins_dir, "plugin-a", "skill-a", category="qa")
    _make_plugin(plugins_dir, "plugin-b", "skill-b", category="export")
    mocker.patch("fiftyone.config.plugins_dir", plugins_dir)

    skills = fop.list_skills(category="qa")

    assert len(skills) == 1
    assert skills[0].name == "skill-a"


def test_list_skills_no_skills_key(mocker, plugins_dir):
    _make_plugin_no_skills(plugins_dir, "plugin-a")
    mocker.patch("fiftyone.config.plugins_dir", plugins_dir)

    assert fop.list_skills() == []


def test_list_skills_missing_file_skipped(mocker, plugins_dir):
    plugin_dir = os.path.join(plugins_dir, "plugin-a")
    os.makedirs(plugin_dir, exist_ok=True)
    with open(os.path.join(plugin_dir, "fiftyone.yml"), "w") as f:
        f.write(_PLUGIN_YML.format(plugin="plugin-a", skill="missing"))
    # intentionally not creating the skill file
    mocker.patch("fiftyone.config.plugins_dir", plugins_dir)

    assert fop.list_skills() == []


def test_install_skills_unknown_agent(mocker, plugins_dir):
    _make_plugin(plugins_dir, "plugin-a", "skill-a")
    mocker.patch("fiftyone.config.plugins_dir", plugins_dir)

    with pytest.raises(ValueError, match="Unsupported agent"):
        fop.install_skills(agents="gemini")


def test_install_skills_creates_central_copy(
    mocker, plugins_dir, tmp_path_factory
):
    _make_plugin(plugins_dir, "plugin-a", "skill-a")
    mocker.patch("fiftyone.config.plugins_dir", plugins_dir)

    central = str(tmp_path_factory.mktemp("central"))
    agent_dir = str(tmp_path_factory.mktemp("agent"))
    mocker.patch("fiftyone.plugins.skills._CENTRAL_LOCAL", central)
    mocker.patch(
        "fiftyone.plugins.skills._LOCAL_TARGETS", {"claude": agent_dir}
    )

    fop.install_skills(agents="claude")

    assert os.path.isfile(os.path.join(central, "skill-a", "SKILL.md"))


def test_install_skills_creates_symlink(mocker, plugins_dir, tmp_path_factory):
    _make_plugin(plugins_dir, "plugin-a", "skill-a")
    mocker.patch("fiftyone.config.plugins_dir", plugins_dir)

    central = str(tmp_path_factory.mktemp("central"))
    agent_dir = str(tmp_path_factory.mktemp("agent"))
    mocker.patch("fiftyone.plugins.skills._CENTRAL_LOCAL", central)
    mocker.patch(
        "fiftyone.plugins.skills._LOCAL_TARGETS", {"claude": agent_dir}
    )

    fop.install_skills(agents="claude")

    link = os.path.join(agent_dir, "skill-a")
    assert os.path.islink(link)
    assert os.path.realpath(link) == os.path.realpath(
        os.path.join(central, "skill-a")
    )


def test_install_skills_returns_names(mocker, plugins_dir, tmp_path_factory):
    _make_plugin(plugins_dir, "plugin-a", "skill-a")
    _make_plugin(plugins_dir, "plugin-b", "skill-b")
    mocker.patch("fiftyone.config.plugins_dir", plugins_dir)

    central = str(tmp_path_factory.mktemp("central"))
    agent_dir = str(tmp_path_factory.mktemp("agent"))
    mocker.patch("fiftyone.plugins.skills._CENTRAL_LOCAL", central)
    mocker.patch(
        "fiftyone.plugins.skills._LOCAL_TARGETS", {"claude": agent_dir}
    )

    installed = fop.install_skills(agents="claude")

    assert set(installed) == {"skill-a", "skill-b"}


def test_parse_skill_frontmatter_valid(tmp_path_factory):
    tmp = tmp_path_factory.mktemp("skills")
    skill_file = tmp / "SKILL.md"
    skill_file.write_text("---\nname: my-skill\ncategory: qa\n---\n# body\n")

    metadata = fps._parse_skill_frontmatter(str(skill_file))

    assert metadata["name"] == "my-skill"
    assert metadata["category"] == "qa"


def test_parse_skill_frontmatter_none(tmp_path_factory):
    tmp = tmp_path_factory.mktemp("skills")
    skill_file = tmp / "SKILL.md"
    skill_file.write_text("# No frontmatter here\n")

    assert fps._parse_skill_frontmatter(str(skill_file)) == {}
