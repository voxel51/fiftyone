"""
FiftyOne Server /samples route

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import asyncio
from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request

import fiftyone.core.clips as focl
from fiftyone.core.expressions import ViewField as F
import fiftyone.core.json as foj
import fiftyone.core.media as fom
import fiftyone.core.odm as foo

from fiftyone.server.decorators import route
import fiftyone.server.metadata as fosm
import fiftyone.server.view as fosv

import json
import os
import glob


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
            dirname = os.path.dirname(filepath)
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
