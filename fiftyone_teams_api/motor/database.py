"""
| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from typing import TYPE_CHECKING, Any, Dict, Optional, Union

import bson
import pymongo
from motor import motor_asyncio
import pymongo

from fiftyone_teams_api import client as fiftyone_teams_api_client

from fiftyone_teams_api.motor import proxy

from fiftyone_teams_api.motor import collection, change_stream, command_cursor
from fiftyone_teams_api.pymongo import command_cursor as pymongo_command_cursor

if TYPE_CHECKING:
    from fiftyone_teams_api.motor.client import AsyncIOMotorClient


class AsyncIOMotorDatabase(
    proxy.MotorRestProxy, motor_cls=motor_asyncio.AsyncIOMotorDatabase
):
    """Proxy class for motor.motor_asyncio.AsyncIOMotorDatabase"""

    # pylint: disable=missing-function-docstring

    def __init__(
        self,
        client: "AsyncIOMotorClient",
        name: str,
        codec_options: Optional[bson.codec_options.CodecOptions] = None,
        read_preference: Optional[pymongo.read_preferences._ServerMode] = None,
        write_concern: Optional[pymongo.write_concern.WriteConcern] = None,
        read_concern: Optional[pymongo.read_concern.ReadConcern] = None,
    ):
        self.__client = client
        self.__name = name
        self.__codec_options = codec_options
        self.__read_preference = read_preference
        self.__write_concern = write_concern
        self.__read_concern = read_concern

        # Initialize proxy class
        proxy.MotorRestProxy.__init__(self)

    def __eq__(self, other: Any) -> bool:
        if isinstance(other, AsyncIOMotorDatabase):
            return self.client == other.client and self.name == other.name
        return NotImplemented

    def __getattr__(self, name: str) -> collection.AsyncIOMotorCollection:
        if name.startswith("_"):
            raise AttributeError(
                f"Database has no attribute {name!r}. To access the {name} "
                f"collection, use db[{name!r}]."
            )

        return self[name]

    def __getitem__(self, name: str) -> collection.AsyncIOMotorCollection:
        return self.get_collection(name)

    def __repr__(self):
        return f"{self.__class__.__name__}({self.__client!r},'{self.__name}')"

    @property
    def client(self) -> "MongoClient":
        return self.__client

    @property
    def name(self) -> str:
        return self.__name

    @property
    def teams_api_client(self) -> fiftyone_teams_api_client.Client:
        return self.client.teams_api_client

    @property
    def teams_api_ctx(self) -> proxy.TeamsContext:
        args = (
            self.__name,
            self.__codec_options,
            self.__read_preference,
            self.__write_concern,
            self.__read_concern,
        )
        return [("get_database", args, {})]

    def aggregate(
        self, *args: Any, **kwargs: Any
    ) -> command_cursor.AsyncIOMotorCommandCursor:
        return command_cursor.AsyncIOMotorCommandCursor(self, *args, **kwargs)

    async def create_collection(
        self, name: str, *args: Any, **kwargs: Any
    ) -> collection.AsyncIOMotorCollection:
        self.teams_api_execute_proxy(
            "create_collection", (name, *args), kwargs
        )
        return self.get_collection(name, *args, **kwargs)

    async def drop_collection(
        self,
        name_or_collection: Union[str, collection.AsyncIOMotorCollection],
        *args: Any,
        **kwargs: Any,
    ) -> Dict[str, Any]:
        try:
            name = name_or_collection.name
        except AttributeError:
            name = name_or_collection

        return self.teams_api_execute_proxy(
            "drop_collection", (name, *args), kwargs
        )

    def get_collection(
        self, name: str, *args: Any, **kwargs: Any
    ) -> collection.AsyncIOMotorCollection:
        return collection.AsyncIOMotorCollection(self, name, *args, **kwargs)

    async def list_collections(
        self, *args: Any, **kwargs: Any
    ) -> pymongo_command_cursor.CommandCursor:
        # This is inconsistent behavior with other method but this is what
        # motor is doing.
        return pymongo_command_cursor.CommandCursor(
            self, "list_collections", *args, **kwargs
        )

    def watch(
        self, *args: Any, **kwargs: Any
    ) -> change_stream.AsyncIOMotorChangeStream:
        return change_stream.AsyncIOMotorChangeStream(self, *args, **kwargs)

    def with_options(
        self,
        codec_options: Optional[bson.codec_options.CodecOptions] = None,
        read_preference: Optional[pymongo.read_preferences._ServerMode] = None,
        write_concern: Optional[pymongo.write_concern.WriteConcern] = None,
        read_concern: Optional[pymongo.read_concern.ReadConcern] = None,
    ) -> "AsyncIOMotorDatabase":
        return self.__class__(
            self.__client,
            self.__name,
            self.__codec_options if codec_options is None else codec_options,
            self.__read_preference
            if read_preference is None
            else read_preference,
            self.__write_concern if write_concern is None else write_concern,
            self.__read_concern if read_concern is None else read_concern,
        )
