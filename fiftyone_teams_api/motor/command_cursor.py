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


class AsyncIOMotorCommandCursor(
    proxy.MotorWebsocketProxy,
    motor_cls=motor_asyncio.AsyncIOMotorCommandCursor,
):
    """Proxy class for motor.motor_asyncio.AsyncIOMotorCommandCursor"""

    # pylint: disable=missing-function-docstring

    def __init__(
        self,
        target: Union["MongoClient", "Database", "Collection"],
        command: str,
        *args: Any,
        **kwargs: Any,
    ):
        self._target = target

        # Initialize proxy class
        proxy.MotorWebsocketProxy.__init__(self, command, args, kwargs)

    def __del__(self):
        pipeline = self._kwargs.get(
            "pipeline", (self._args[0] if self._args else [])
        )

        # This is special case because async cursors don't run automatically,
        # so if we have a case where a collection gets created or updated we
        # need to explicitly cast it to a list.
        if any(stage.get("$out") or stage.get("$merge") for stage in pipeline):
            self.teams_api_execute_proxy("to_list", kwargs=dict(length=None))

        proxy.MotorWebsocketProxy.__del__(self)

    @property
    def session(self) -> None:
        return None

    @property
    def teams_api_client(self) -> client.Client:
        return self._target.teams_api_client

    @property
    def teams_api_ctx(self) -> Dict[str, Any]:
        return self._target.teams_api_ctx


#
