"""
| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import abc
from typing import TYPE_CHECKING, Any, Iterable, Mapping, Optional, Union

import pymongo
import pymongo.errors

from fiftyone.api.pymongo import mixin, proxy

if TYPE_CHECKING:
    from fiftyone.api.pymongo.collection import Collection


class AbstractCursor(proxy.PymongoWebsocketProxy, abc.ABC):
    """Abstract proxy for cursors"""

    def __init__(
        self,
        collection: "Collection",
        attr,
        # pylint: disable-next=redefined-builtin
        filter: Optional[Mapping[str, Any]] = None,
        projection: Optional[Union[Mapping[str, Any], Iterable[str]]] = None,
        skip: int = 0,
        limit: int = 0,
        **kwargs,
    ):
        self.__collection = collection
        self.__attr = attr  # "find"
        self.__current_pos = 0

        super().__init__(
            filter=filter,
            projection=projection,
            skip=skip,
            limit=limit,
            **kwargs,
        )

    def _handle_disconnect(self):
        raise pymongo.errors.CursorNotFound("Cursor::Websocket disconnect")

    @property
    def __proxy_api_client__(self) -> proxy.ProxyAPIClient:
        return self.collection.__proxy_api_client__

    @property
    def __proxy_api_context__(self) -> proxy.ProxyAPIContext:
        kwargs = dict(self._proxy_init_kwargs)
        kwargs["skip"] = kwargs["skip"] + self.__current_pos
        return [
            *self.collection.__proxy_api_context__,
            (self.__attr, [], kwargs),
        ]

    @property
    def _limit(self) -> int:
        return self._proxy_init_kwargs["limit"]

    @_limit.setter
    def _limit(self, value) -> None:
        self._proxy_init_kwargs["limit"] = value

    @property
    def _skip(self) -> int:
        return self._proxy_init_kwargs["skip"]

    @_skip.setter
    def _skip(self, value) -> None:
        self._proxy_init_kwargs["skip"] = value

    def __getitem__(self, index):
        if isinstance(index, slice):
            if index.step is not None:
                raise IndexError("Cursor instances do not support slice steps")

            skip = index.start if index.start is not None else 0
            limit = index.stop - skip if index.stop is not None else 0

            self.skip(skip)
            self.limit(limit)

            return self

        if isinstance(index, int):
            if index < 0:
                raise IndexError(
                    "Cursor instances do not support negative indices"
                )

            clone = self.clone().skip(index + self._skip)
            clone.limit(-1)
            return next(clone)

    def __copy__(self) -> "Cursor":
        return self.clone()

    def __deepcopy__(self, _: Any) -> Any:
        return self.clone()

    @property
    # pylint: disable-next=missing-function-docstring
    def collection(self) -> "Collection":
        return self.__collection

    @property
    # pylint: disable-next=missing-function-docstring
    def session(self) -> None:
        return None

    # pylint: disable-next=missing-function-docstring
    def clone(self):
        return self.collection.find(**self._proxy_init_kwargs)

    # pylint: disable-next=missing-function-docstring
    def limit(self, limit: int) -> "Cursor":
        self._limit = limit
        self.__proxy_it__("limit", (self._limit,))
        return self

    # pylint: disable-next=missing-function-docstring
    def skip(self, skip: int) -> "Cursor":
        self._skip = skip
        self.__proxy_it__("skip", (self._skip,))
        return self

    # pylint: disable-next=missing-function-docstring
    def next(self) -> Any:
        value = super().next()
        self.__current_pos += 1
        return value


class Cursor(mixin.PymongoWebsocketProxyDunderMixin, AbstractCursor):
    """Proxy for pymongo.cursor.Cursor"""

    __proxy_class__ = pymongo.cursor.Cursor


class RawBatchCursor(Cursor):
    """Proxy for pymongo.cursor.RawBatchCursor"""

    __proxy_class__ = pymongo.cursor.RawBatchCursor

    # pylint: disable-next=missing-function-docstring
    def clone(self):
        return RawBatchCursor(self.__collection, **self._proxy_init_kwargs)
