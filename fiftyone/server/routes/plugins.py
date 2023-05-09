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
from fiftyone.plugins import list_plugins


class Plugins(HTTPEndpoint):
    @route
    async def get(self, request: Request, data: dict):
        plugin_packages = [
            plugin_definition.to_json() for plugin_definition in list_plugins()
        ]
        return {"plugins": plugin_packages}


def load_json_or_none(filepath):
    try:
        return etas.read_json(filepath)
    except FileNotFoundError:
        return None
