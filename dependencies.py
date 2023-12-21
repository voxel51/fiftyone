"""
FiftyOne dependencies build hook.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from importlib import metadata
import re

from hatchling.builders.hooks.plugin.interface import BuildHookInterface

CHOOSE_DEPENDENCIES = [
    (
        (
            "opencv-python",
            "opencv-contrib-python",
            "opencv-contrib-python-headless",
        ),
        "opencv-python-headless",
    )
]


def choose_dependency(mains, secondary):
    chosen = secondary
    for main in mains:
        try:
            name = re.split(r"[!<>=]", main)[0]
            metadata.version(name)
            chosen = main
            break
        except metadata.PackageNotFoundError:
            pass

    return str(chosen)


def get_environment_dependencies(install_requires, choose_install_requires):
    for mains, secondary in choose_install_requires:
        install_requires.append(choose_dependency(mains, secondary))

    return install_requires


class CustomHook(BuildHookInterface):
    """A build hook for dynamic fiftyone dependencies."""

    def initialize(self, _, build_data):
        """Choose environment specific dynamic dependencies"""
        build_data["dependencies"] = get_environment_dependencies(
            [], CHOOSE_DEPENDENCIES
        )
