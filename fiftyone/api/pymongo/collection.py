"""
| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from typing import (
    TYPE_CHECKING,
    Any,
    Dict,
    Iterable,
    MutableMapping,
    Sequence,
    Union,
)

import bson
import bson.raw_bson
import pymongo

from fiftyone.api import client
from fiftyone.api.pymongo import proxy
from fiftyone.api.pymongo import change_stream
from fiftyone.api.pymongo import command_cursor
from fiftyone.api.pymongo import cursor


if TYPE_CHECKING:
    from fiftyone.api.pymongo.database import Database


class Collection(
    proxy.PymongoRestProxy, pymongo_cls=pymongo.collection.Collection
):
    """Proxy class for pymongo.collection.Collection"""

    # pylint: disable=missing-function-docstring

    def __init__(
        self,
        database: "Database",
        name: str,
        create: bool = False,
        **kwargs: Any,
    ):
        self.__database = database
        self.__name = name
        self.__create = create
        self.__kwargs = kwargs

        # Initialize proxy class
        proxy.PymongoRestProxy.__init__(self)

    def __eq__(self, other: Any) -> bool:
        if isinstance(other, Collection):
            return self.database == other.database and self.name == other.name
        return NotImplemented

    def __getattr__(self, name: str) -> "Collection":
        if name.startswith("_"):
            raise AttributeError(
                f"Collection has no attribute {name!r}. To access the {name} "
                f"sub-collection, use col[{name!r}]."
            )
        return self.__getitem__(name)

    def __getitem__(self, name: str) -> "Collection":
        return Collection(self.database, f"{self.__name}.{name}")

    @property
    def database(self) -> "Database":
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
            ("get_collection", (self.__name, self.__create), self.__kwargs),
        ]

    def aggregate(
        self, *args: Any, **kwargs: Any
    ) -> command_cursor.CommandCursor:
        return command_cursor.CommandCursor(self, "aggregate", *args, **kwargs)

    def aggregate_raw_batches(
        self, *args: Any, **kwargs: Any
    ) -> command_cursor.RawBatchCommandCursor:
        return command_cursor.RawBatchCommandCursor(
            self, "aggregate_raw_batches", *args, **kwargs
        )

    def bulk_write(
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

    def find(self, *args: Any, **kwargs: Any) -> cursor.Cursor:
        return cursor.Cursor(self, *args, **kwargs)

    def find_raw_batches(
        self, *args: Any, **kwargs: Any
    ) -> cursor.RawBatchCursor:
        return cursor.RawBatchCursor(self, *args, **kwargs)

    def insert_one(
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

    def insert_many(
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
    ) -> command_cursor.CommandCursor[MutableMapping[str, Any]]:
        return command_cursor.CommandCursor(
            self, "list_indexes", *args, **kwargs
        )

    def rename(
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
    ) -> change_stream.CollectionChangeStream:
        return change_stream.CollectionChangeStream(self, *args, **kwargs)
