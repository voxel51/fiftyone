"""
FiftyOne Server ``/plugins`` route.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import glob
import os

from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request

import eta.core.serial as etas

import fiftyone as fo
from fiftyone.server.decorators import route


class Plugins(HTTPEndpoint):
    @route
    async def get(self, request: Request, data: dict):
        plugins_dir = fo.config.plugins_dir

        if not plugins_dir:
            return {"plugins": [], "settings": None}

        settings_path = os.path.join(plugins_dir, "settings.json")
        settings = load_json_or_none(settings_path)

        pkgs = glob.glob(os.path.join(plugins_dir, "*", "package.json"))
        pkgs += glob.glob(
            os.path.join(plugins_dir, "node_modules", "*", "package.json")
        )
        plugin_packages = []

        for filepath in pkgs:
            pkg = etas.read_json(filepath)

            if "fiftyone" not in pkg:
                continue

            plugin_definition = {
                "name": pkg["name"],
                "version": pkg["version"],
            }
            plugin_definition.update(pkg["fiftyone"])
            plugin_definition["scriptPath"] = "/" + os.path.join(
                "plugins",
                os.path.dirname(os.path.relpath(filepath, plugins_dir)),
                plugin_definition["script"],
            )
            plugin_packages.append(plugin_definition)

        return {"plugins": plugin_packages, "settings": settings}


def load_json_or_none(filepath):
    try:
        return etas.read_json(filepath)
    except FileNotFoundError:
        return None
