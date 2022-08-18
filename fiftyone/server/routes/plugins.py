"""
FiftyOne Server /plugins route

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import json
import os
import glob

from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request


from fiftyone.server.decorators import route


class Plugins(HTTPEndpoint):
    @route
    async def get(self, request: Request, data: dict):
        dir = os.environ.get("FIFTYONE_PLUGINS_DIR")

        settingsFilepath = os.path.join(dir, "settings.json")
        settings = load_json_file(settingsFilepath)

        pkgs = glob.glob(os.path.join(dir, "*", "package.json"))
        pkgs += glob.glob(
            os.path.join(dir, "node_modules", "*", "package.json")
        )
        plugin_packages = []

        for filepath in pkgs:
            f = open(filepath, "r")
            pkg = json.loads(f.read())
            plugin_definition = {
                "name": pkg["name"],
                "version": pkg["version"],
            }
            plugin_definition.update(pkg["fiftyone"])
            plugin_definition["scriptPath"] = "/" + os.path.join(
                "plugins",
                os.path.dirname(os.path.relpath(filepath, dir)),
                plugin_definition["script"],
            )
            plugin_packages.append(plugin_definition)
        return {"plugins": plugin_packages, "settings": settings}


def load_json_file(path_to_file):
    if os.path.isfile(path_to_file) and os.access(path_to_file, os.R_OK):
        f = open(path_to_file, "r")
        return json.loads(f.read())
    else:
        return None
