"""
| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import abc
from typing import TYPE_CHECKING, Any, Union

import pymongo

from fiftyone.api.pymongo import mixin, proxy

if TYPE_CHECKING:
    from fiftyone.api import pymongo as fomongo


class AbstractCommandCursor(proxy.PymongoWebsocketProxy, abc.ABC):
    """Abstract proxy for command cursors"""

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
        self.__target = target
        self.__command = command

        super().__init__(*args, **kwargs)

    @property
    def __proxy_api_client__(self) -> proxy.ProxyAPIClient:
        return self.__target.__proxy_api_client__

    @property
    def __proxy_api_context__(self) -> proxy.ProxyAPIContext:
        return [
            *self.__target.__proxy_api_context__,
            (self.__command, self._proxy_init_args, self._proxy_init_kwargs),
        ]

    def close(self) -> None:
        if self.__command == "aggregate":
            pipeline = self._proxy_init_kwargs.get(
                "pipeline",
                (self._proxy_init_args[0] if self._proxy_init_args else []),
            )

            # This is special case because async cursors don't run
            # automatically, so if we have a case where a collection gets
            # created or updated we need to explicitly cast it to a list.
            if any(
                stage.get("$out") or stage.get("$merge") for stage in pipeline
            ):
                self.__proxy_it__("to_list", kwargs=dict(length=None))

    @property
    # pylint: disable-next=missing-function-docstring
    def session(self) -> None:
        return None


class CommandCursor(
    mixin.PymongoWebsocketProxyDunderMixin, AbstractCommandCursor
):
    """Proxy for pymongo.command_cursor.CommandCursor"""

    __proxy_class__ = pymongo.command_cursor.CommandCursor


class RawBatchCommandCursor(CommandCursor):
    """Proxy for pymongo.command_cursor.RawBatchCommandCursor"""

    __proxy_class__ = pymongo.command_cursor.RawBatchCommandCursor
