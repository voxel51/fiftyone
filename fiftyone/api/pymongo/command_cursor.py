"""
| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import abc
import copy
from typing import TYPE_CHECKING, Any, Union

import pymongo
import pymongo.command_cursor
import pymongo.errors

from fiftyone.api.pymongo import mixin, proxy

if TYPE_CHECKING:
    from fiftyone.api.pymongo import client, collection, database


class AbstractCommandCursor(proxy.PymongoWebsocketProxy, abc.ABC):
    """Abstract proxy for command cursors"""

    def __init__(
        self,
        target: Union[
            "client.MongoClient",
            "database.Database",
            "collection.Collection",
        ],
        command: str,
        *args: Any,
        **kwargs: Any,
    ):
        self.__target = target
        self.__command = command
        self._is_pipeline_command = self.__command in (
            "aggregate",
            "aggregate_raw_batches",
        )

        args, kwargs = [copy.deepcopy(value) for value in (args, kwargs)]
        if self._is_pipeline_command:
            if "pipeline" not in kwargs:
                if args:
                    args = list(args)
                    kwargs["pipeline"] = args.pop(0)
                else:
                    kwargs["pipeline"] = []

        self.__current_pos = 0
        self.__added_skip = False

        super().__init__(*args, **kwargs)

    @property
    def __proxy_api_client__(self) -> proxy.ProxyAPIClient:
        return self.__target.__proxy_api_client__

    @property
    def __proxy_api_context__(self) -> proxy.ProxyAPIContext:        
        kwargs = dict(self._proxy_init_kwargs)
        if self._is_pipeline_command and self.__current_pos > 0:

            if not self.__added_skip:
                kwargs["pipeline"].append({"$skip": self.__current_pos})
                self.__added_skip = True
            else:
                kwargs["pipeline"][-1]["$skip"] = self.__current_pos

        return [
            *self.__target.__proxy_api_context__,
            (self.__command, self._proxy_init_args, kwargs),
        ]

    def next(self) -> Any:
        value = super().next()
        self.__current_pos += 1
        return value

    @property
    # pylint: disable-next=missing-function-docstring
    def session(self) -> None:
        return None


class CommandCursor(
    mixin.PymongoWebsocketProxyDunderMixin, AbstractCommandCursor
):
    """Proxy for pymongo.command_cursor.CommandCursor"""

    __proxy_class__ = pymongo.command_cursor.CommandCursor

    def __init__(
        self,
        target: Union[
            "fomongo.MongoClient",
            "fomongo.database.Database",
            "fomongo.collection.Collection",
        ],
        command: str,
        *args: Any,
        **kwargs: Any,
    ):
        super().__init__(target, command, *args, **kwargs)

        if self._is_pipeline_command:
            try:
                last_stage = self._proxy_init_kwargs["pipeline"][-1] or {}
            except IndexError:
                last_stage = {}

            # This is special case because the server uses `motor` cursors
            # which do not run automatically like their `pymongo`
            # counterparts. In the case when a collection gets created or
            # updated in a pipeline (using the $merge or $out stage), the
            # cursor needs to be explicitly called, in this case using
            # "to_list".
            if any(key in last_stage for key in ("$merge", "$out")):
                self.__proxy_it__("to_list", (0,))


class RawBatchCommandCursor(CommandCursor):
    """Proxy for pymongo.command_cursor.RawBatchCommandCursor"""

    __proxy_class__ = pymongo.command_cursor.RawBatchCommandCursor
