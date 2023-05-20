"""
| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from typing import TYPE_CHECKING, Any, Dict, Union

import pymongo

from fiftyone.api import client
from fiftyone.api.pymongo import proxy

if TYPE_CHECKING:
    from fiftyone.api.pymongo.client import MongoClient
    from fiftyone.api.pymongo.database import Database
    from fiftyone.api.pymongo.collection import Collection


_Target = Union["MongoClient", "Database", "Collection"]


class ChangeStream(
    proxy.PymongoWebsocketProxy, pymongo_cls=pymongo.change_stream.ChangeStream
):
    """Proxy class for pymongo.change_stream.ChangeStream"""

    def __init__(self, target: _Target, *args, **kwargs):
        self._target = target
        proxy.PymongoWebsocketProxy.__init__(self, "watch", *args, **kwargs)

    @property
    def teams_api_client(self) -> client.Client:
        return self._target.teams_api_client

    @property
    def teams_api_ctx(self) -> Dict[str, Any]:
        return self._target.teams_api_ctx


class ClusterChangeStream(
    ChangeStream, pymongo_cls=pymongo.change_stream.ClusterChangeStream
):
    """Proxy class for pymongo.change_stream.ClusterChangeStream"""

    def __init__(self, target: "MongoClient", *args, **kwargs):
        super().__init__(target, *args, **kwargs)


class CollectionChangeStream(
    ChangeStream, pymongo_cls=pymongo.change_stream.CollectionChangeStream
):
    """Proxy class for pymongo.change_stream.CollectionChangeStream"""

    def __init__(self, target: "Collection", *args, **kwargs):
        super().__init__(target, *args, **kwargs)


class DatabaseChangeStream(
    ChangeStream, pymongo_cls=pymongo.change_stream.DatabaseChangeStream
):
    """Proxy class for pymongo.change_stream.DatabaseChangeStream"""

    def __init__(self, target: "Database", *args, **kwargs):
        super().__init__(target, *args, **kwargs)
