"""
| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import asyncio
from typing import Any, Optional

import bson
import pymongo
from motor import motor_asyncio

from fiftyone_teams_api import client as api_client

from fiftyone_teams_api.motor import proxy

from fiftyone_teams_api.motor import change_stream
from fiftyone_teams_api.motor import command_cursor
from fiftyone_teams_api.motor import database


class AsyncIOMotorClient(
    proxy.MotorRestProxy, motor_cls=motor_asyncio.AsyncIOMotorClient
):
    """Proxy class for motor.motor_asyncio.AsyncIOMotorClient"""

    def __init__(self, *_: Any, **kwargs: Any):
        # Initialize Teams API client
        api_url = kwargs.get("__teams_api_uri")
        api_key = kwargs.get("__teams_api_key")

        if not api_url and not api_key:
            raise ValueError(
                "AsyncIOMotorClient requires an API URL and an API key."
            )

        self.__teams_api_client = api_client.Client(api_url, api_key)

        # Initialize proxy class
        proxy.MotorRestProxy.__init__(self)

    @property
    def io_loop(self):
        return asyncio.get_event_loop()

    def __getattr__(self, name):
        if name.startswith("_"):
            raise AttributeError(
                "%s has no attribute %r. To access the %s"
                " database, use client['%s']."
                % (self.__class__.__name__, name, name, name)
            )

        return self[name]

    def __getitem__(self, name):
        return database.AsyncIOMotorDatabase(self, name)

    def __eq__(self, other: Any) -> bool:
        if isinstance(other, self.__class__):
            return self.teams_api_client == other.teams_api_client

        return NotImplemented

    def __ne__(self, other: Any) -> bool:
        return not self == other

    def __hash__(self) -> int:
        return hash(self._topology)

    def __repr__(self):
        return f"{self.__class__.__name__}({self.__teams_api_client!r})"

    @property
    def address(self) -> None:
        return None

    @property
    def arbiters(self) -> None:
        return None

    @property
    def is_mongos(self) -> bool:
        return False

    @property
    def is_primary(self) -> bool:
        return True

    @property
    def nodes(self) -> None:
        return None

    @property
    def options(self):
        return None

    @property
    def primary(self) -> None:
        return None

    @property
    def secondaries(self) -> None:
        return None

    @property
    def teams_api_client(self) -> api_client.Client:
        return self.__teams_api_client

    @property
    def teams_api_ctx(self) -> proxy.TeamsContext:
        return []

    @property
    def topology_description(self):
        return None

    def close(self) -> None:
        ...

    def get_database(
        self,
        name: Optional[str] = None,
        codec_options: Optional[bson.codec_options.CodecOptions] = None,
        read_preference: Optional[pymongo.read_preferences._ServerMode] = None,
        write_concern: Optional[pymongo.write_concern.WriteConcern] = None,
        read_concern: Optional[pymongo.read_concern.ReadConcern] = None,
    ) -> database.AsyncIOMotorDatabase:
        if not name:
            return self.get_default_database()

        return database.AsyncIOMotorDatabase(
            self,
            name,
            codec_options,
            read_preference,
            write_concern,
            read_concern,
        )

    def get_default_database(
        self,
        default: Optional[str] = None,
        codec_options: Optional[bson.codec_options.CodecOptions] = None,
        read_preference: Optional[pymongo.read_preferences._ServerMode] = None,
        write_concern: Optional[pymongo.write_concern.WriteConcern] = None,
        read_concern: Optional[pymongo.read_concern.ReadConcern] = None,
    ) -> database.AsyncIOMotorDatabase:
        # The following proxy call is is a special method only on the server
        # to help is restricting which databases a SDK user has access to.
        default = self.teams_api_execute_proxy("__get_default_database_name")

        return database.AsyncIOMotorDatabase(
            self,
            default,
            codec_options,
            read_preference,
            write_concern,
            read_concern,
        )

    async def list_databases(
        self, *args: Any, **kwargs: Any
    ) -> command_cursor.AsyncIOMotorCommandCursor:
        return command_cursor.AsyncIOMotorCommandCursor(
            self, "list_databases", *args, **kwargs
        )

    async def start_session(self, *args: Any, **kwargs: Any) -> None:
        raise NotImplementedError

    def watch(
        self, *args: Any, **kwargs: Any
    ) -> change_stream.AsyncIOMotorChangeStream:
        return change_stream.AsyncIOMotorChangeStream(self, *args, **kwargs)
