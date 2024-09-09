"""
| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from typing import Any, Optional

import bson
import pymongo

from fiftyone.api import client as api_client
from fiftyone.api.pymongo import change_stream, command_cursor, database, proxy


class MongoClient(proxy.PymongoRestProxy):
    """Proxy for pymongo.MongoClient"""

    __proxy_class__ = pymongo.MongoClient

    def __init__(self, *args: Any, **kwargs: Any):
        # Initialize Teams API client
        api_url = kwargs.pop("__teams_api_uri")
        api_key = kwargs.pop("__teams_api_key")
        disable_websocket_info_logs = kwargs.pop(
            "__teams_disable_websocket_info_logs", True
        )

        if not api_url and not api_key:
            raise ValueError("MongoClient requires an API URL and an API key.")

        self.__proxy_api_client = api_client.Client(
            api_url,
            api_key,
            disable_websocket_info_logs=disable_websocket_info_logs,
        )

        super().__init__(*args, **kwargs)

        with pymongo.MongoClient(*args, **kwargs) as cli:
            self.__codec_options = cli.codec_options
            self.__read_concern = cli.read_concern
            self.__read_preference = cli.read_preference
            self.__write_concern = cli.write_concern

    @property
    def __proxy_api_client__(self) -> proxy.ProxyAPIClient:
        return self.__proxy_api_client

    @property
    def __proxy_api_context__(self) -> proxy.ProxyAPIContext:
        return []

    def __getattr__(self, __name: str) -> Any:
        if __name.startswith("_"):
            raise AttributeError(
                f"MongoClient has no attribute {__name!r}. To access the "
                f"{__name} database, use client[{__name!r}]."
            )

        return self.get_database(__name)

    def __getitem__(self, name: str) -> database.Database:
        return self.get_database(name)

    def __eq__(self, other: Any) -> bool:
        if isinstance(other, self.__proxy_class__):
            try:
                return self.__proxy_api_client__ == other.__proxy_api_client__
            except AttributeError:
                ...

        return NotImplemented

    def __ne__(self, other: Any) -> bool:
        return not self == other

    def __hash__(self) -> int:
        return hash(self._topology)

    def __repr__(self):
        return f"MongoClient({{url={self.__proxy_api_client__.base_url}}})"

    @property
    # pylint: disable-next=missing-function-docstring
    def codec_options(self):
        return self.__codec_options

    @property
    # pylint: disable-next=missing-function-docstring
    def read_preference(self):
        return self.__read_preference

    @property
    # pylint: disable-next=missing-function-docstring
    def write_concern(self):
        return self.__write_concern

    @property
    # pylint: disable-next=missing-function-docstring
    def read_concern(self):
        return self.__read_concern

    @property
    # pylint: disable-next=missing-function-docstring
    def address(self) -> None:
        return None

    @property
    # pylint: disable-next=missing-function-docstring
    def arbiters(self) -> None:
        return None

    @property
    # pylint: disable-next=missing-function-docstring
    def is_mongos(self) -> bool:
        return False

    @property
    # pylint: disable-next=missing-function-docstring
    def is_primary(self) -> bool:
        return True

    @property
    # pylint: disable-next=missing-function-docstring
    def nodes(self) -> None:
        return None

    @property
    # pylint: disable-next=missing-function-docstring
    def options(self):
        return None

    @property
    # pylint: disable-next=missing-function-docstring
    def primary(self) -> None:
        return None

    @property
    # pylint: disable-next=missing-function-docstring
    def secondaries(self) -> None:
        return None

    @property
    # pylint: disable-next=missing-function-docstring
    def topology_description(self):
        return None

    # pylint: disable-next=missing-function-docstring
    def close(self) -> None:
        ...

    def _get_database(
        self,
        name: Optional[str] = None,
        codec_options: Optional[bson.codec_options.CodecOptions] = None,
        read_preference: Optional[pymongo.read_preferences._ServerMode] = None,
        write_concern: Optional[pymongo.write_concern.WriteConcern] = None,
        read_concern: Optional[pymongo.read_concern.ReadConcern] = None,
    ) -> database.Database:
        return database.Database(
            self,
            name,
            codec_options,
            read_preference,
            write_concern,
            read_concern,
        )

    # pylint: disable-next=missing-function-docstring
    def get_database(
        self,
        name: Optional[str] = None,
        codec_options: Optional[bson.codec_options.CodecOptions] = None,
        read_preference: Optional[pymongo.read_preferences._ServerMode] = None,
        write_concern: Optional[pymongo.write_concern.WriteConcern] = None,
        read_concern: Optional[pymongo.read_concern.ReadConcern] = None,
    ) -> database.Database:
        if not name:
            return self.get_default_database()

        return self._get_database(
            name,
            codec_options,
            read_preference,
            write_concern,
            read_concern,
        )

    # pylint: disable-next=missing-function-docstring
    def get_default_database(
        self,
        default: Optional[str] = None,
        codec_options: Optional[bson.codec_options.CodecOptions] = None,
        read_preference: Optional[pymongo.read_preferences._ServerMode] = None,
        write_concern: Optional[pymongo.write_concern.WriteConcern] = None,
        read_concern: Optional[pymongo.read_concern.ReadConcern] = None,
    ) -> database.Database:
        # The following proxy call is is a special method only on the server
        # to help is restricting which databases a SDK user has access to.
        default = self.__proxy_it__("__get_default_database_name")

        return self._get_database(
            default,
            codec_options,
            read_preference,
            write_concern,
            read_concern,
        )

    # pylint: disable-next=missing-function-docstring
    def list_databases(
        self, *args: Any, **kwargs: Any
    ) -> command_cursor.CommandCursor:
        return command_cursor.CommandCursor(
            self, "list_databases", *args, **kwargs
        )

    # pylint: disable-next=missing-function-docstring
    def start_session(self, *args: Any, **kwargs: Any) -> None:
        raise NotImplementedError

    # pylint: disable-next=missing-function-docstring
    def watch(
        self, *args: Any, **kwargs: Any
    ) -> change_stream.ClusterChangeStream:
        return change_stream.ClusterChangeStream(self, *args, **kwargs)
