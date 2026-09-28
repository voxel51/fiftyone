"""
FiftyOne Server order service: tokens and a per-process handle cache over an
:class:`OrderBackend`.

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
    OrderBackend,
    OrderHandle,
    OrderMismatch,
    OrderSpec,
    Page,
    SeekTarget,
)
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
    total: int


class OrderService:
    """Opens orders and serves their seeks and pages. Tokens carry their
    spec, so any process can serve a token it did not open."""

    def __init__(
        self,
        backend: OrderBackend,
        budget: t.Optional[Budget] = None,
        max_handles: int = MAX_HANDLES,
    ):
        self._backend = backend
        self._budget = budget or Budget()
        self._max = max_handles
        self._handles: "OrderedDict[str, OrderHandle]" = OrderedDict()
        self._lock = threading.Lock()

    def open(self, spec: OrderSpec) -> Opened:
        key = spec.digest()
        cached = self._get(key)
        if cached is not None:
            if self._backend.version(cached) == cached.version:
                return Opened(encode_token(spec, cached.version), cached)

        handle = self._backend.open(spec, self._budget)
        self._put(key, handle)
        return Opened(encode_token(spec, handle.version), handle)

    def handle(self, token: str) -> OrderHandle:
        spec, _ = decode_token(token)
        key = spec.digest()
        cached = self._get(key)
        if cached is not None:
            return cached

        handle = self._backend.open(spec, self._budget)
        self._put(key, handle)
        return handle

    def seek(self, token: str, target: SeekTarget) -> t.Tuple[str, int]:
        return self._backend.seek(self.handle(token), target)

    def boundaries(self, handle: OrderHandle, count: int):
        return self._backend.boundaries(handle, count)

    def page(
        self,
        token: str,
        view_spec: OrderSpec,
        position: t.Optional[str],
        direction: Direction,
        limit: int,
        seek: t.Optional[SeekTarget] = None,
    ) -> t.Tuple[OrderHandle, Page, str]:
        """A page of the order, from ``position`` or from the ``seek``
        target, with the data's current version."""
        spec, _ = decode_token(token)
        if spec.view_digest() != view_spec.view_digest():
            raise OrderMismatch("the view differs from the order's view")

        handle = self.handle(token)
        if seek is not None:
            position, _ = self._backend.seek(handle, seek)
            direction = Direction.FORWARD

        page = self._backend.page(handle, position, direction, limit)
        return handle, page, self._backend.version(handle)

    def status(self, token: str) -> Status:
        _, version = decode_token(token)
        handle = self.handle(token)
        current = self._backend.version(handle)
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
            previous = self._handles.pop(key, None)
            self._handles[key] = handle
            evicted = []
            while len(self._handles) > self._max:
                evicted.append(self._handles.popitem(last=False)[1])

        for old in ([previous] if previous else []) + evicted:
            self._backend.release(old)
