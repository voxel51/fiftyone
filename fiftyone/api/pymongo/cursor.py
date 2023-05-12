"""
| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from typing import TYPE_CHECKING, Any, Dict, Iterable, Mapping, Optional, Union

import pymongo

from fiftyone.api import client
from fiftyone.api.pymongo import proxy

if TYPE_CHECKING:
    from fiftyone.api.pymongo.collection import Collection

CursorType = pymongo.cursor.CursorType
_Sort = pymongo.cursor._Sort  # pylint: disable=protected-access
_CollationIn = pymongo.cursor._CollationIn  # pylint: disable=protected-access
_Hint = pymongo.cursor._Hint  # pylint: disable=protected-access
_Sort = pymongo.cursor._Sort  # pylint: disable=protected-access
_Sort = pymongo.cursor._Sort  # pylint: disable=protected-access


class Cursor(proxy.PymongoWebsocketProxy, pymongo_cls=pymongo.cursor.Cursor):
    """Proxy class for pymongo.cursor.Cursor"""

    # pylint: disable=missing-function-docstring

    def __init__(
        self,
        collection: "Collection",
        # pylint: disable-next=redefined-builtin
        filter: Optional[Mapping[str, Any]] = None,
        projection: Optional[Union[Mapping[str, Any], Iterable[str]]] = None,
        skip: int = 0,
        limit: int = 0,
        *args,
        **kwargs,
    ):
        self._collection = collection

        # Initialize proxy class
        proxy.PymongoWebsocketProxy.__init__(
            self, "find", [filter, projection, skip, limit, *args], kwargs
        )

    @property
    def _limit(self):
        return self._args[3]

    @_limit.setter
    def _limit(self, value):
        self._args[3] = value

    @property
    def _skip(self):
        return self._args[2]

    @_skip.setter
    def _skip(self, value):
        self._args[2] = value

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
    def collection(self) -> "Collection":
        return self._collection

    @property
    def session(self) -> None:
        return None

    @property
    def teams_api_client(self) -> client.Client:
        return self._collection.teams_api_client

    @property
    def teams_api_ctx(self) -> Dict[str, Any]:
        return self._collection.teams_api_ctx

    def clone(self):
        return self.__class__(self._collection, **self._kwargs)

    def limit(self, limit: int) -> "Cursor":
        self._limit = limit
        self.teams_api_execute_proxy("limit", (limit,))
        return self

    def skip(self, skip: int) -> "Cursor":
        self._skip = skip
        self.teams_api_execute_proxy("skip", (skip,))
        return self


class RawBatchCursor(Cursor, pymongo_cls=pymongo.cursor.RawBatchCursor):
    """Proxy class for pymongo.cursor.RawBatchCursor"""
