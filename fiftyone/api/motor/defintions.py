"""
| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import asyncio
from typing import Any, Optional

import bson
from motor import motor_asyncio
import pymongo

from fiftyone.api import pymongo as fomongo
from fiftyone.api.motor import mixin, proxy


class AsyncIOMotorChangeStream(
    mixin.PymongoWebsocketProxyAsyncDunderMixin,
    fomongo.change_stream.AbstractChangeStream,
    metaclass=proxy.MotorProxyMeta,
):
    """Proxy for motor.motor_asyncio.AsyncIOMotorChangeStream"""

    __proxy_class__ = motor_asyncio.AsyncIOMotorChangeStream


class AsyncIOMotorCommandCursor(
    mixin.PymongoWebsocketProxyAsyncDunderMixin,
    fomongo.command_cursor.AbstractCommandCursor,
    metaclass=proxy.MotorProxyMeta,
):
    """Proxy for motor.motor_asyncio.AsyncIOMotorCommandCursor"""

    __proxy_class__ = motor_asyncio.AsyncIOMotorCommandCursor


class AsyncIOMotorCursor(
    mixin.PymongoWebsocketProxyAsyncDunderMixin,
    fomongo.cursor.AbstractCursor,
    metaclass=proxy.MotorProxyMeta,
):
    """Proxy for motor.motor_asyncio.AsyncIOMotorCursor"""

    __proxy_class__ = motor_asyncio.AsyncIOMotorCursor


class AsyncIOMotorCollection(
    fomongo.collection.Collection, metaclass=proxy.MotorProxyMeta
):
    """Proxy for motor.motor_asyncio.AsyncIOMotorCollection"""

    __proxy_class__ = motor_asyncio.AsyncIOMotorCollection

    def __init__(
        self, database: "AsyncIOMotorDatabase", name: str, **kwargs: Any
    ):
        super().__init__(database, name=name, **kwargs)

    def __getitem__(self, name):
        return AsyncIOMotorCollection(self.database, f"{self.__name}.{name}")

    def __repr__(self):
        return f"{self.__class__.__name__}({self.database!r},'{self.name}')"

    def aggregate(
        self, *args: Any, **kwargs: Any
    ) -> AsyncIOMotorCommandCursor:
        return AsyncIOMotorCommandCursor(self, "aggregate", *args, **kwargs)

    def aggregate_raw_batches(
        self, *args: Any, **kwargs: Any
    ) -> AsyncIOMotorCommandCursor:
        return AsyncIOMotorCommandCursor(
            self, "aggregate_raw_batches", *args, **kwargs
        )

    def find(self, *args: Any, **kwargs: Any) -> AsyncIOMotorCursor:
        return AsyncIOMotorCursor(self, "find", *args, **kwargs)

    def find_raw_batches(
        self, *args: Any, **kwargs: Any
    ) -> AsyncIOMotorCursor:
        return AsyncIOMotorCursor(self, *args, **kwargs)

    def list_indexes(
        self, *args: Any, **kwargs: Any
    ) -> AsyncIOMotorCommandCursor:
        return AsyncIOMotorCommandCursor(self, "list_indexes", *args, **kwargs)

    def watch(self, *args: Any, **kwargs: Any) -> AsyncIOMotorChangeStream:
        return AsyncIOMotorChangeStream(self, *args, **kwargs)


class AsyncIOMotorDatabase(
    fomongo.database.Database, metaclass=proxy.MotorProxyMeta
):
    """Proxy for motor.motor_asyncio.AsyncIOMotorDatabase"""

    __proxy_class__ = motor_asyncio.AsyncIOMotorDatabase

    def __repr__(self):
        return f"{self.__class__.__name__}({self.client!r},'{self.name}')"

    def aggregate(
        self, *args: Any, **kwargs: Any
    ) -> AsyncIOMotorCommandCursor:
        return AsyncIOMotorCommandCursor(self, *args, **kwargs)

    def get_collection(
        self, name: str, *args: Any, **kwargs: Any
    ) -> AsyncIOMotorCollection:
        return AsyncIOMotorCollection(self, name, *args, **kwargs)

    # pylint: disable-next=missing-function-docstring, invalid-overridden-method
    async def list_collections(
        self, *args: Any, **kwargs: Any
    ) -> fomongo.command_cursor.CommandCursor:
        # This is inconsistent behavior with other method but this is what
        # motor is doing.
        return fomongo.command_cursor.CommandCursor(
            self, "list_collections", *args, **kwargs
        )

    def watch(self, *args: Any, **kwargs: Any) -> AsyncIOMotorChangeStream:
        return AsyncIOMotorChangeStream(self, *args, **kwargs)


class AsyncIOMotorClient(fomongo.MongoClient, metaclass=proxy.MotorProxyMeta):
    """Proxy for motor.motor_asyncio.AsyncIOMotorClient"""

    __proxy_class__ = motor_asyncio.AsyncIOMotorClient

    def __repr__(self):
        return f"{self.__class__.__name__}({self.__proxy_api_client__!r})"

    @property
    # pylint: disable-next=missing-function-docstring
    def io_loop(self):
        return asyncio.get_event_loop()

    def close(self) -> None:
        ...

    def _get_database(
        self,
        name: Optional[str] = None,
        codec_options: Optional[bson.codec_options.CodecOptions] = None,
        read_preference: Optional[pymongo.read_preferences._ServerMode] = None,
        write_concern: Optional[pymongo.write_concern.WriteConcern] = None,
        read_concern: Optional[pymongo.read_concern.ReadConcern] = None,
    ) -> AsyncIOMotorDatabase:
        return AsyncIOMotorDatabase(
            self,
            name,
            codec_options,
            read_preference,
            write_concern,
            read_concern,
        )

    # pylint: disable-next=missing-function-docstring, invalid-overridden-method
    async def list_databases(
        self, *args: Any, **kwargs: Any
    ) -> AsyncIOMotorCommandCursor:
        return AsyncIOMotorCommandCursor(
            self, "list_databases", *args, **kwargs
        )

    # pylint: disable-next=missing-function-docstring, invalid-overridden-method
    async def start_session(self, *args: Any, **kwargs: Any) -> None:
        raise NotImplementedError

    # pylint: disable-next=missing-function-docstring
    def watch(self, *args: Any, **kwargs: Any) -> AsyncIOMotorChangeStream:
        return AsyncIOMotorChangeStream(self, *args, **kwargs)
