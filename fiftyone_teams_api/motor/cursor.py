"""
| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from typing import TYPE_CHECKING, Any, Dict, Iterable, Mapping, Optional, Union

from motor import motor_asyncio
import pymongo

from fiftyone_teams_api import client
from fiftyone_teams_api.motor import proxy

if TYPE_CHECKING:
    from fiftyone_teams_api.motor.collection import AsyncIOMotorCollection

CursorType = pymongo.cursor.CursorType
_Sort = pymongo.cursor._Sort  # pylint: disable=protected-access
_CollationIn = pymongo.cursor._CollationIn  # pylint: disable=protected-access
_Hint = pymongo.cursor._Hint  # pylint: disable=protected-access
_Sort = pymongo.cursor._Sort  # pylint: disable=protected-access
_Sort = pymongo.cursor._Sort  # pylint: disable=protected-access


class AsyncIOMotorCursor(
    proxy.MotorWebsocketProxy, motor_cls=motor_asyncio.AsyncIOMotorCursor
):
    """Proxy class for motor.motor_asyncio.AsyncIOMotorCursor"""

    # pylint: disable=missing-function-docstring

    def __init__(
        self,
        collection: "AsyncIOMotorCollection",
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
        proxy.MotorWebsocketProxy.__init__(
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

    def __copy__(self) -> "AsyncIOMotorCursor":
        return self.clone()

    def __deepcopy__(self, _: Any) -> Any:
        return self.clone()

    @property
    def collection(self) -> "AsyncIOMotorCollection":
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
        return self.__class__(self._collection, *self._args, **self._kwargs)

    def limit(self, limit: int) -> "AsyncIOMotorCursor":
        self._limit = limit
        self.teams_api_execute_proxy("limit", (limit,))
        return self

    def skip(self, skip: int) -> "AsyncIOMotorCursor":
        self._skip = skip
        self.teams_api_execute_proxy("skip", (skip,))
        return self
