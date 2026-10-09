"""
FiftyOne Server order service: tokens and a per-process handle cache over
:class:`fiftyone.server.order.mongo.MongoOrderBackend`.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from collections import OrderedDict
from dataclasses import dataclass
import threading
import typing as t

from fiftyone.server.order.backend import (
    Budget,
    Direction,
    OrderHandle,
    OrderMismatch,
    OrderSpec,
    Page,
    SeekTarget,
)
from fiftyone.server.order.mongo import MongoOrderBackend
from fiftyone.server.order.positions import decode_token, encode_token

MAX_HANDLES = 32


@dataclass
class Opened:
    token: str
    handle: OrderHandle


@dataclass
class Status:
    stale: bool
    version: str
    total: t.Optional[int]


class OrderService(object):
    """Opens orders and serves their pages. Tokens carry their spec, so any
    process can serve a token it did not open."""

    def __init__(
        self,
        backend: MongoOrderBackend,
        max_handles: int = MAX_HANDLES,
    ):
        self._backend = backend
        self._max = max_handles
        self._handles: "OrderedDict[str, OrderHandle]" = OrderedDict()
        self._lock = threading.Lock()

    @property
    def backend(self) -> MongoOrderBackend:
        return self._backend

    def open(self, spec: OrderSpec, budget: Budget) -> Opened:
        key = spec.digest()
        cached = self._get(key)
        if cached is not None:
            if self._backend.version(cached, budget) == cached.version:
                return Opened(encode_token(spec, cached.version), cached)

        handle = self._backend.open(spec, budget)
        self._put(key, handle)
        return Opened(encode_token(spec, handle.version), handle)

    def handle(self, token: str, budget: Budget) -> OrderHandle:
        spec, _ = decode_token(token)
        key = spec.digest()
        cached = self._get(key)
        if cached is not None:
            return cached

        handle = self._backend.open(spec, budget)
        self._put(key, handle)
        return handle

    def page(
        self,
        token: str,
        view_spec: OrderSpec,
        position: t.Optional[str],
        direction: Direction,
        limit: int,
        seek: t.Optional[SeekTarget],
        budget: Budget,
    ) -> t.Tuple[OrderHandle, Page, str]:
        """A page of the order, from ``position`` or from the ``seek``
        target, with the data's current version."""
        spec, _ = decode_token(token)
        if spec.view_digest() != view_spec.view_digest():
            raise OrderMismatch("the view differs from the order's view")

        handle = self.handle(token, budget)
        if seek is not None:
            position = self._backend.seek(handle, seek, budget)
            direction = Direction.FORWARD

        page = self._backend.page(handle, position, direction, limit, budget)
        return handle, page, self._backend.version(handle, budget)

    def status(self, token: str, budget: Budget) -> Status:
        _, version = decode_token(token)
        handle = self.handle(token, budget)
        current = self._backend.version(handle, budget)
        return Status(
            stale=current != version, version=current, total=handle.total
        )

    def _get(self, key: str) -> t.Optional[OrderHandle]:
        with self._lock:
            handle = self._handles.get(key)
            if handle is not None:
                self._handles.move_to_end(key)

            return handle

    def _put(self, key: str, handle: OrderHandle) -> None:
        with self._lock:
            self._handles.pop(key, None)
            self._handles[key] = handle
            while len(self._handles) > self._max:
                self._handles.popitem(last=False)
