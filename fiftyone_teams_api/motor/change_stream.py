"""
| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from typing import TYPE_CHECKING, Any, Dict, Union

from motor import motor_asyncio

from fiftyone_teams_api import client
from fiftyone_teams_api.motor import proxy

if TYPE_CHECKING:
    from fiftyone_teams_api.motor.client import AsyncIOMotorClient
    from fiftyone_teams_api.motor.database import AsyncIOMotorDatabase
    from fiftyone_teams_api.motor.collection import AsyncIOMotorCollection


_Target = Union[
    "AsyncIOMotorClient", "AsyncIOMotorDatabase", "AsyncIOMotorCollection"
]


class AsyncIOMotorChangeStream(
    proxy.MotorWebsocketProxy, motor_cls=motor_asyncio.AsyncIOMotorChangeStream
):
    """Proxy class for motor.motor_asyncio.AsyncIOMotorChangeStream"""

    def __init__(self, target: _Target, *args, **kwargs):
        self._target = target
        proxy.MotorWebsocketProxy.__init__(self, "watch", *args, **kwargs)

    @property
    def teams_api_client(self) -> client.Client:
        return self._target.teams_api_client

    @property
    def teams_api_ctx(self) -> Dict[str, Any]:
        return self._target.teams_api_ctx
