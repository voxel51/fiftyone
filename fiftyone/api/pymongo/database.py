"""
| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from typing import TYPE_CHECKING, Any, Dict, Optional, Union

import bson
import pymongo

from fiftyone.api.pymongo import (
    change_stream,
    collection,
    command_cursor,
    proxy,
)

if TYPE_CHECKING:
    from fiftyone.api import pymongo as fomongo


class Database(proxy.PymongoRestProxy):
    """Proxy for pymongo.MongoClient"""

    __proxy_class__ = pymongo.database.Database

    def __init__(
        self,
        client: "fomongo.MongoClient",
        name: str,
        codec_options: Optional[bson.codec_options.CodecOptions] = None,
        read_preference: Optional[pymongo.read_preferences._ServerMode] = None,
        write_concern: Optional[pymongo.write_concern.WriteConcern] = None,
        read_concern: Optional[pymongo.read_concern.ReadConcern] = None,
        **kwargs,
    ):
        self.__client = client

        super().__init__(
            name=name,
            **{
                k: v if v is not None else getattr(client, k)
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
        return self.client.__proxy_api_client__

    @property
    def __proxy_api_context__(self) -> proxy.ProxyAPIContext:
        return [
            ("get_database", self._proxy_init_args, self._proxy_init_kwargs)
        ]

    def __eq__(self, other: Any) -> bool:
        if isinstance(other, self.__proxy_class__):
            return self.client == other.client and self.name == other.nam
        return NotImplemented

    def __getattr__(self, __name: str) -> Any:
        # Try to get attribute using proxy first.
        try:
            return super().__getattr__(__name)
        except AttributeError:
            ...

        # Try to get new collection.
        if __name.startswith("_"):
            raise AttributeError(
                f"Database has no attribute {__name!r}. To access the "
                f"{__name} collection, use db[{__name!r}]."
            )
        return self.get_collection(__name)

    def __getitem__(self, name: str) -> collection.Collection:
        return self.get_collection(name)

    @property
    # pylint: disable-next=missing-function-docstring
    def client(self) -> "MongoClient":
        return self.__client

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
        self, *args: Any, **kwargs: Any
    ) -> command_cursor.CommandCursor:
        return command_cursor.CommandCursor(self, *args, **kwargs)

    # pylint: disable-next=missing-function-docstring
    def create_collection(
        self, name: str, *args: Any, **kwargs: Any
    ) -> collection.Collection:
        self.__proxy_it__("create_collection", (name, *args), kwargs)
        return self.get_collection(name, *args, **kwargs)

    # pylint: disable-next=missing-function-docstring
    def drop_collection(
        self,
        name_or_collection: Union[str, collection.Collection],
        *args: Any,
        **kwargs: Any,
    ) -> Dict[str, Any]:
        try:
            name = name_or_collection.name
        except AttributeError:
            name = name_or_collection

        return self.__proxy_it__("drop_collection", (name, *args), kwargs)

    # pylint: disable-next=missing-function-docstring
    def get_collection(
        self, name: str, *args: Any, **kwargs: Any
    ) -> collection.Collection:
        return collection.Collection(self, name, *args, **kwargs)

    # pylint: disable-next=missing-function-docstring
    def list_collections(
        self, *args: Any, **kwargs: Any
    ) -> command_cursor.CommandCursor:
        return command_cursor.CommandCursor(
            self, "list_collections", *args, **kwargs
        )

    # pylint: disable-next=missing-function-docstring
    def watch(
        self, *args: Any, **kwargs: Any
    ) -> change_stream.CollectionChangeStream:
        return change_stream.DatabaseChangeStream(self, *args, **kwargs)

    # pylint: disable-next=missing-function-docstring
    def with_options(
        self,
        codec_options: Optional[bson.codec_options.CodecOptions] = None,
        read_preference: Optional[pymongo.read_preferences._ServerMode] = None,
        write_concern: Optional[pymongo.write_concern.WriteConcern] = None,
        read_concern: Optional[pymongo.read_concern.ReadConcern] = None,
    ) -> "Database":
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
        return self.client.get_database(**kwargs)
