"""
FiftyOne Server ``/plugins`` route.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request

from fiftyone.server.decorators import route
from fiftyone.plugins.permissions import ManagedPlugins
from fiftyone.plugins import list_plugins
from fiftyone.utils.decorators import route_requires_auth


class Plugins(HTTPEndpoint):
    @route
    async def get(self, request: Request, data: dict):
        plugin_dicts = [pd.to_dict() for pd in list_plugins()]

        requires_authentication = route_requires_auth(self.__class__)
        if requires_authentication:
            plugin_dicts = filter_disabled_plugins(request, plugin_dicts)

        return {"plugins": plugin_dicts}


def filter_disabled_plugins(request, plugin_dicts):
    managed_plugins = ManagedPlugins.for_request(request)
    return [
        d
        for d in plugin_dicts
        if managed_plugins.has_enabled_plugin(d.get("name", None))
    ]
