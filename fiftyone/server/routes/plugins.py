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
        
        dir = os.environ.get('FIFTYONE_PLUGINS_DIR')
        pkgs = glob.glob(os.path.join(dir, '*', 'package.json'))
        plugin_packages = []
        print(pkgs)

        for filepath in pkgs:
            print(filepath)
            f = open(filepath, 'r')
            pkg = json.loads(f.read())
            plugin_definition = {
                'name': pkg["name"],
                'version': pkg["version"]
            }
            plugin_definition.update(pkg["fiftyone"])
            dirname = os.path.dirname(filepath)
            plugin_definition["scriptPath"] = '/' + os.path.join(
                'plugins',
                os.path.basename(dirname),
                plugin_definition["script"]
            )
            plugin_packages.append(plugin_definition)
        return {"plugins": plugin_packages}
