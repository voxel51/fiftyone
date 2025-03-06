"""
| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging
from typing import (
    TYPE_CHECKING,
    Any,
    Iterable,
    Mapping,
    MutableMapping,
    Optional,
    Sequence,
    Union,
)

import bson
import bson.raw_bson
import pymongo
import requests.exceptions
from bson import ObjectId
from pymongo import WriteConcern

from fiftyone.api.pymongo import proxy, change_stream, command_cursor, cursor


if TYPE_CHECKING:
    from fiftyone.api.pymongo.database import Database


class Collection(proxy.PymongoRestProxy):
    """Proxy for pymongo.collection.Collection"""

    __proxy_class__ = pymongo.collection.Collection

    def __init__(
        self,
        database: "Database",
        name: str,
        create: bool = False,
        codec_options: Optional[bson.codec_options.CodecOptions] = None,
        read_preference: Optional[pymongo.read_preferences._ServerMode] = None,
        write_concern: Optional[pymongo.write_concern.WriteConcern] = None,
        read_concern: Optional[pymongo.read_concern.ReadConcern] = None,
        **kwargs,
    ):
        self.__database = database

        super().__init__(
            name=name,
            create=create,
            **{
                k: v if v is not None else getattr(database, k)
                for k, v in dict(
                    codec_options=codec_options,
                    read_preference=read_preference,
                    write_concern=write_concern,
                    read_concern=read_concern,
                ).items()
            },
            **kwargs,
        )

    @property
    def __proxy_api_client__(self) -> proxy.ProxyAPIClient:
        return self.database.__proxy_api_client__

    @property
    def __proxy_api_context__(self) -> proxy.ProxyAPIContext:
        return [
            *self.database.__proxy_api_context__,
            ("get_collection", [self.name], None),
        ]

    def __eq__(self, other: Any) -> bool:
        if isinstance(other, self.__class__):
            return self.database == other.database and self.name == other.name
        return NotImplemented

    def __getattr__(self, __name: str) -> Any:
        if __name.startswith("_"):
            raise AttributeError(
                f"Collection has no attribute {__name!r}. To access the "
                f"{__name} sub-collection, use col[{__name!r}]."
            )
        return self.__getitem__(__name)

    def __getitem__(self, name: str) -> "Collection":
        return Collection(self.database, f"{self.name}.{name}")

    @property
    # pylint: disable-next=missing-function-docstring
    def database(self) -> "Database":
        return self.__database

    @property
    # pylint: disable-next=missing-function-docstring
    def full_name(self) -> str:
        return f"{self.database.name}.{self.name}"

    @property
    # pylint: disable-next=missing-function-docstring
    def name(self) -> str:
        return self._proxy_init_kwargs["name"]

    @property
    # pylint: disable-next=missing-function-docstring
    def codec_options(self):
        return self._proxy_init_kwargs["codec_options"]

    @property
    # pylint: disable-next=missing-function-docstring
    def read_preference(self):
        return self._proxy_init_kwargs["read_preference"]

    @property
    # pylint: disable-next=missing-function-docstring
    def write_concern(self):
        return self._proxy_init_kwargs["write_concern"]

    @property
    # pylint: disable-next=missing-function-docstring
    def read_concern(self):
        return self._proxy_init_kwargs["read_concern"]

    # pylint: disable-next=missing-function-docstring
    def aggregate(
        self, pipeline: Sequence[Mapping[str, Any]], *args: Any, **kwargs: Any
    ) -> command_cursor.CommandCursor:
        return command_cursor.CommandCursor(
            self, "aggregate", pipeline, *args, **kwargs
        )

    # pylint: disable-next=missing-function-docstring
    def aggregate_raw_batches(
        self, *args: Any, **kwargs: Any
    ) -> command_cursor.RawBatchCommandCursor:
        return command_cursor.RawBatchCommandCursor(
            self, "aggregate_raw_batches", *args, **kwargs
        )

    # pylint: disable-next=missing-function-docstring
    def bulk_write(
        self,
        requests: Sequence[
            Union[
                pymongo.InsertOne,
                pymongo.DeleteOne,
                pymongo.DeleteMany,
                pymongo.ReplaceOne,
                pymongo.UpdateOne,
                pymongo.UpdateMany,
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
            res = self.__proxy_it__("bulk_write", (requests, *args), kwargs)
        except pymongo.errors.BulkWriteError as bwe:
            # Remove any manually set _ids before re-raising.
            for err in bwe.details["writeErrors"]:
                if "index" not in err or err["index"] not in manually_set:
                    continue

                # pylint: disable-next=protected-access
                del requests[err["index"]]._doc["_id"]

            raise bwe

        return res

    # pylint: disable-next=missing-function-docstring
    def find(self, *args: Any, **kwargs: Any) -> cursor.Cursor:
        print("find args=", args)
        print("find kwargs=", kwargs)
        return cursor.Cursor(self, "find", *args, **kwargs)

    # pylint: disable-next=missing-function-docstring
    def find_raw_batches(
        self, *args: Any, **kwargs: Any
    ) -> cursor.RawBatchCursor:
        return cursor.RawBatchCursor(self, *args, **kwargs)

    # pylint: disable-next=missing-function-docstring
    def insert_one(
        self,
        document: bson.raw_bson.RawBSONDocument,
        *args: Any,
        **kwargs: Any,
    ) -> pymongo.results.InsertOneResult:

        # Add _id to document passed in if it doesn't exist so that
        # if the operation is retried due to a timeout, we don't
        # end up with duplicate samples
        if "_id" not in document:
            document["_id"] = ObjectId()

        res = self.__proxy_it__("insert_one", (document, *args), kwargs)

        return res

    # pylint: disable-next=missing-function-docstring
    def insert_many(
        self,
        documents: Iterable[bson.raw_bson.RawBSONDocument],
        *args: Any,
        **kwargs: Any,
    ) -> pymongo.results.InsertManyResult:
        inserted_ids = []

        if documents:
            # Modify each document client-side and ensure _id exists and is first
            # to avoid additional reordering server-side
            # https://github.com/mongodb/specifications/blob/master/source/crud/bulk-write.md#insert
            for i, doc in enumerate(documents):
                oid = doc.pop("_id", ObjectId())
                inserted_ids.append(oid)
                doc["_id"] = oid
                documents[i] = {"_id": oid, **doc}
            try:
                _ = self.__proxy_it__(
                    "insert_many",
                    (documents, *args),
                    kwargs,
                    is_idempotent=False,
                )
            except requests.exceptions.ReadTimeout as e:
                logging.debug("ReadTimeout for method `insert_many`: %s", e)

                # ReadTimeouts can occur even if the operation eventually succeeds server-side.
                # In this case, check for the last inserted _id to ensure all documents were sent
                # and that it's not an error with inserting documents entirely.
                try:
                    inserted = self.find_one(
                        ({"_id": inserted_ids[-1]}, {"_id": 1}),
                        {"hint": {"_id": 1}},
                    )
                    if not inserted:
                        raise e
                    logging.warning(
                        "Response to `insert_many` request taking too long. "
                        "To avoid further issues, try reducing the batch size."
                    )
                except Exception as err:
                    logging.debug(
                        f"Error while checking last inserted _id {inserted_ids[-1]}:",
                        err,
                    )
                    # If the last inserted _id is not found, raise the original ReadTimeout error
                    raise e

        return pymongo.results.InsertManyResult(
            inserted_ids, acknowledged=WriteConcern() != 0
        )

    # pylint: disable-next=missing-function-docstring
    def list_indexes(
        self, *args: Any, **kwargs: Any
    ) -> command_cursor.CommandCursor:
        return command_cursor.CommandCursor(
            self, "list_indexes", *args, **kwargs
        )

    # pylint: disable-next=missing-function-docstring
    def rename(
        self,
        new_name: str,
        *args: Any,
        **kwargs: Any,
    ) -> MutableMapping[str, Any]:
        return_value = self.__proxy_it__("rename", (new_name, *args), kwargs)

        self._proxy_init_kwargs["name"] = new_name

        return return_value

    # pylint: disable-next=missing-function-docstring
    def watch(
        self, *args: Any, **kwargs: Any
    ) -> change_stream.CollectionChangeStream:
        return change_stream.CollectionChangeStream(self, *args, **kwargs)

    # pylint: disable-next=missing-function-docstring
    def with_options(
        self,
        codec_options: Optional[bson.codec_options.CodecOptions] = None,
        read_preference: Optional[pymongo.read_preferences._ServerMode] = None,
        write_concern: Optional[pymongo.write_concern.WriteConcern] = None,
        read_concern: Optional[pymongo.read_concern.ReadConcern] = None,
    ) -> "Collection":
        kwargs = dict(self._proxy_init_kwargs)
        kwargs.update(
            {
                k: v
                for k, v in dict(
                    codec_options=codec_options,
                    read_preference=read_preference,
                    write_concern=write_concern,
                    read_concern=read_concern,
                ).items()
                if v is not None
            }
        )

        return self.database.get_collection(**kwargs)
