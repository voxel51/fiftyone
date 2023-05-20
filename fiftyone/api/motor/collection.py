"""
| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from typing import (
    TYPE_CHECKING,
    Any,
    Iterable,
    MutableMapping,
    Sequence,
    Union,
)

import bson
import bson.raw_bson
import pymongo
from motor import motor_asyncio

from fiftyone.api import client
from fiftyone.api.motor import (
    change_stream,
    command_cursor,
    cursor,
    proxy,
)


if TYPE_CHECKING:
    from fiftyone.api.motor.database import AsyncIOMotorDatabase


class AsyncIOMotorCollection(
    proxy.MotorRestProxy, motor_cls=motor_asyncio.AsyncIOMotorCollection
):
    """Proxy class for motor.motor_asyncio.AsyncIOMotorCollection"""

    # pylint: disable=missing-function-docstring

    def __init__(
        self, database: "AsyncIOMotorDatabase", name: str, **kwargs: Any
    ):
        self.__database = database
        self.__name = name
        self.__kwargs = kwargs

        # Initialize proxy class
        proxy.MotorRestProxy.__init__(self)

    def __eq__(self, other: Any) -> bool:
        if isinstance(other, AsyncIOMotorCollection):
            return self.database == other.database and self.name == other.name
        return NotImplemented

    def __getattr__(self, name):
        if name.startswith("_"):
            full_name = "%s.%s" % (self.name, name)
            raise AttributeError(
                "%s has no attribute %r. To access the %s"
                " collection, use database['%s']."
                % (self.__class__.__name__, name, full_name, full_name)
            )

        return self[name]

    def __getitem__(self, name):
        return AsyncIOMotorCollection(self.database, f"{self.__name}.{name}")

    def __repr__(self):
        return (
            f"{self.__class__.__name__}({self.__database!r},'{self.__name}')"
        )

    @property
    def database(self) -> "AsyncIOMotorDatabase":
        return self.__database

    @property
    def full_name(self) -> str:
        return f"{self.database.name}.{self.name}"

    @property
    def name(self) -> str:
        return self.__name

    @property
    def teams_api_client(self) -> client.Client:
        return self.__database.teams_api_client

    @property
    def teams_api_ctx(self) -> proxy.TeamsContext:
        return [
            *self.__database.teams_api_ctx,
            ("get_collection", (self.__name,), self.__kwargs),
        ]

    def aggregate(
        self, *args: Any, **kwargs: Any
    ) -> command_cursor.AsyncIOMotorCommandCursor:
        return command_cursor.AsyncIOMotorCommandCursor(
            self, "aggregate", *args, **kwargs
        )

    def aggregate_raw_batches(
        self, *args: Any, **kwargs: Any
    ) -> command_cursor.AsyncIOMotorCommandCursor:
        return command_cursor.AsyncIOMotorCommandCursor(
            self, "aggregate_raw_batches", *args, **kwargs
        )

    async def bulk_write(
        self,
        requests: Sequence[
            Union[
                pymongo.operations.InsertOne,
                pymongo.operations.DeleteOne,
                pymongo.operations.DeleteMany,
                pymongo.operations.ReplaceOne,
                pymongo.operations.UpdateOne,
                pymongo.operations.UpdateMany,
            ]
        ],
        *args: Any,
        **kwargs: Any,
    ) -> pymongo.results.BulkWriteResult:
        # Inserted ids ARE NOT returned in the BulkWriteResult, adding them
        # prior to sending to the server.
        manually_set = set()
        for idx, request in enumerate(requests):
            if isinstance(request, pymongo.InsertOne):
                document = request._doc  # pylint: disable=protected-access
                if not (
                    isinstance(document, bson.raw_bson.RawBSONDocument)
                    or "_id" in document
                ):
                    document["_id"] = bson.ObjectId()
                    manually_set.add(idx)

        try:
            res = self.teams_api_execute_proxy(
                "bulk_write", (requests, *args), kwargs
            )
        except pymongo.errors.BulkWriteError as bwe:
            # Remove any manually set _ids before re-raising.
            for err in bwe.details["writeErrors"]:
                if "index" not in err or err["index"] not in manually_set:
                    continue

                # pylint: disable-next=protected-access
                del requests[err["index"]]._doc["_id"]

            raise bwe

        return res

    def find(self, *args: Any, **kwargs: Any) -> cursor.AsyncIOMotorCursor:
        return cursor.AsyncIOMotorCursor(self, *args, **kwargs)

    def find_raw_batches(
        self, *args: Any, **kwargs: Any
    ) -> cursor.AsyncIOMotorCursor:
        return cursor.AsyncIOMotorCursor(self, *args, **kwargs)

    async def insert_one(
        self,
        document: Union[
            pymongo.typings._DocumentType, bson.raw_bson.RawBSONDocument
        ],
        *args: Any,
        **kwargs: Any,
    ) -> pymongo.results.InsertOneResult:
        res = self.teams_api_execute_proxy(
            "insert_one", (document, *args), kwargs
        )

        # Need to mutate document passed in
        if "_id" not in document:
            document["_id"] = res.inserted_id

        return res

    async def insert_many(
        self,
        documents: Iterable[
            Union[pymongo.typings._DocumentType, bson.raw_bson.RawBSONDocument]
        ],
        *args: Any,
        **kwargs: Any,
    ) -> pymongo.results.InsertManyResult:
        res = self.teams_api_execute_proxy(
            "insert_many", (documents, *args), kwargs
        )

        # Need to mutate documents passed in.
        idx = 0
        for document in documents:
            if "_id" not in document:
                document["_id"] = res.inserted_ids[idx]
                idx += 1
        return res

    def list_indexes(
        self,
        *args: Any,
        **kwargs: Any,
    ) -> command_cursor.AsyncIOMotorCommandCursor:
        return command_cursor.AsyncIOMotorCommandCursor(
            self, "list_indexes", *args, **kwargs
        )

    async def rename(
        self,
        new_name: str,
        *args: Any,
        **kwargs: Any,
    ) -> MutableMapping[str, Any]:
        return_value = self.teams_api_execute_proxy(
            "rename", (new_name, *args), kwargs
        )
        self.__name = new_name
        return return_value

    def watch(
        self, *args: Any, **kwargs: Any
    ) -> change_stream.AsyncIOMotorChangeStream:
        return change_stream.AsyncIOMotorChangeStream(self, *args, **kwargs)
