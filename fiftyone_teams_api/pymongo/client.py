"""
| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from typing import Any, Dict, Optional

import bson
import pymongo

from fiftyone_teams_api import client as api_client
from fiftyone_teams_api.pymongo import proxy
from fiftyone_teams_api.pymongo import change_stream
from fiftyone_teams_api.pymongo import command_cursor
from fiftyone_teams_api.pymongo import database


class MongoClient(proxy.PymongoRestProxy, pymongo_cls=pymongo.MongoClient):
    """Proxy class for pymongo.MongoClient"""

    # pylint: disable=missing-function-docstring

    def __init__(self, *_: Any, **kwargs: Any):
        # Initialize Teams API client
        api_url = kwargs.get("__teams_api_uri")
        api_key = kwargs.get("__teams_api_key")

        if not api_url and not api_key:
            raise ValueError("MongoClient requires an API URL and an API key.")

        self.__teams_api_client = api_client.Client(api_url, api_key)

        # Initialize proxy class
        proxy.PymongoRestProxy.__init__(self)

    def __getattr__(self, name: str) -> database.Database:
        if name.startswith("_"):
            raise AttributeError(
                f"MongoClient has no attribute {name!r}. To access the {name} "
                f"database, use client[{name!r}]."
            )
        return self.get_database(name)

    def __getitem__(self, name: str) -> database.Database:
        return self.get_database(name)

    def __eq__(self, other: Any) -> bool:
        if isinstance(other, self.__class__):
            return self.teams_api_client == other.teams_api_client

        return NotImplemented

    def __ne__(self, other: Any) -> bool:
        return not self == other

    def __hash__(self) -> int:
        return hash(self._topology)

    def __repr__(self):
        return f"MongoClient({{url={self.teams_api_client.base_url}}})"

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
    ) -> database.Database:
        if not name:
            return self.get_default_database()

        return database.Database(
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
    ) -> database.Database:
        # The following proxy call is is a special method only on the server
        # to help is restricting which databases a SDK user has access to.
        default = self.teams_api_execute_proxy("__get_default_database_name")
        return database.Database(
            self,
            default,
            codec_options,
            read_preference,
            write_concern,
            read_concern,
        )

    def list_databases(
        self, *args: Any, **kwargs: Any
    ) -> command_cursor.CommandCursor[Dict[str, Any]]:
        return command_cursor.CommandCursor(
            self, "list_databases", *args, **kwargs
        )

    def start_session(self, *args: Any, **kwargs: Any) -> None:
        raise NotImplementedError

    def watch(
        self, *args: Any, **kwargs: Any
    ) -> change_stream.ClusterChangeStream:
        return change_stream.ClusterChangeStream(self, *args, **kwargs)
