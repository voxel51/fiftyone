"""
| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import abc
from typing import TYPE_CHECKING, Any, Union, Iterable

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

        # This is special case because async cursors don't run
        # automatically, so if we have a case where a collection gets
        # created or updated we need to explicitly cast it to a list.
        self.__docs: Union[Iterable[Any], None] = None
        if self.__command in ("aggregate", "aggregate_raw_batches"):
            pipeline = self._proxy_init_kwargs.get(
                "pipeline",
                (self._proxy_init_args[0] if self._proxy_init_args else []),
            )

            try:
                last_stage = pipeline[-1] or {}
            except IndexError:
                last_stage = {}

            if any(key in last_stage for key in ("$merge", "$out")):
                docs = []
                while True:
                    try:
                        docs.append(super().next())
                    except StopIteration:
                        break

                self.__docs = iter(docs)

    @property
    def __proxy_api_client__(self) -> proxy.ProxyAPIClient:
        return self.__target.__proxy_api_client__

    @property
    def __proxy_api_context__(self) -> proxy.ProxyAPIContext:
        return [
            *self.__target.__proxy_api_context__,
            (self.__command, self._proxy_init_args, self._proxy_init_kwargs),
        ]

    def next(self) -> Any:
        if self.__docs is not None:
            return next(self.__docs)
        return super().next()

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
