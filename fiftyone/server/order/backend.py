"""
FiftyOne Server order types.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from dataclasses import dataclass, field
from enum import Enum
import hashlib
import typing as t

from bson import json_util

#: the time limit of every query an order request runs
ORDER_MAX_TIME_MS = 10000


class Mode(str, Enum):
    """How an order is addressed.

    ``SMALL`` collections are addressed by offset. Larger collections are
    ``INDEXED`` when an index serves the sort and the view's filter, which
    allows seeks by value, and ``SCROLL`` otherwise, which pages in order
    only.
    """

    SMALL = "SMALL"
    INDEXED = "INDEXED"
    SCROLL = "SCROLL"


class Scale(str, Enum):
    """How sort values map linearly onto a rail."""

    NUMBER = "NUMBER"
    DATE = "DATE"
    ID = "ID"


class Reason(str, Enum):
    BUDGET_EXCEEDED = "BUDGET_EXCEEDED"
    FRAME_SORT = "FRAME_SORT"
    UNSUPPORTED_STAGE = "UNSUPPORTED_STAGE"


class Direction(str, Enum):
    FORWARD = "FORWARD"
    BACKWARD = "BACKWARD"


class OrderError(Exception):
    """An order request that cannot be served, with a client-facing code."""

    code = "ORDER_ERROR"


class OrderExpired(OrderError):
    code = "ORDER_EXPIRED"


class OrderMismatch(OrderError):
    code = "ORDER_MISMATCH"


class BadPosition(OrderError):
    code = "BAD_POSITION"


class SeekNotAllowed(OrderError):
    code = "SEEK_NOT_ALLOWED"


class BudgetExceeded(OrderError):
    code = "BUDGET_EXCEEDED"


class Cancelled(OrderError):
    code = "CANCELLED"


def _normalize(value):
    return value or None


@dataclass(frozen=True)
class OrderSpec:
    """One ordering of one view: the view arguments plus the sort."""

    dataset: str
    stages: t.List[dict]
    filters: t.Optional[dict] = None
    extended_stages: t.Optional[dict] = None
    group_slice: t.Optional[str] = None
    dynamic_group: t.Any = None
    sort_by: t.Optional[str] = None
    desc: bool = False
    unit: str = "SAMPLE"
    partition: t.Optional[t.List[dict]] = None

    def view_args(self) -> dict:
        extended = dict(self.extended_stages or {})
        # the order carries the sort, so a sort stage is not part of the view
        extended.pop("fiftyone.core.stages.SortBy", None)
        return {
            "dataset": self.dataset,
            "stages": self.stages or [],
            "filters": _normalize(self.filters),
            "extended_stages": _normalize(
                {k: v for k, v in extended.items() if v is not None}
            ),
            "group_slice": self.group_slice,
            "dynamic_group": self.dynamic_group,
        }

    def view_digest(self) -> str:
        return _digest(self.view_args())

    def digest(self) -> str:
        return _digest(self.to_dict())

    def to_dict(self) -> dict:
        return {
            **self.view_args(),
            "sort_by": self.sort_by,
            "desc": bool(self.desc),
            "unit": self.unit,
            "partition": self.partition,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "OrderSpec":
        return cls(**d)


def _digest(value) -> str:
    raw = json_util.dumps(value, sort_keys=True)
    return hashlib.sha1(raw.encode()).hexdigest()


@dataclass
class SeekTarget:
    """Where a seek lands: an offset (``SMALL`` only), a fraction of the
    rail, or the first sample at or past a sort value (``has_value`` tells
    None from unset)."""

    offset: t.Optional[int] = None
    fraction: t.Optional[float] = None
    value: t.Any = None
    has_value: bool = False


@dataclass
class Budget:
    """The limits of one request's queries. ``comment`` tags them so an
    abandoned request can kill them."""

    max_time_ms: int = ORDER_MAX_TIME_MS
    comment: t.Optional[str] = None
    cancelled: bool = False

    def options(self) -> dict:
        options = {"maxTimeMS": self.max_time_ms}
        if self.comment:
            options["comment"] = self.comment

        return options

    def check(self) -> None:
        if self.cancelled:
            raise Cancelled("the request was abandoned")


@dataclass
class OrderPlan:
    mode: t.Optional[Mode]
    path: t.Optional[str] = None
    reason: t.Optional[Reason] = None


@dataclass
class Bounds:
    """The ends of an ``INDEXED`` order's sort index, in ascending order.
    ``scale`` is None when values do not map linearly onto a rail."""

    min: t.Any
    max: t.Any
    has_none: bool
    scale: t.Optional[Scale]


@dataclass
class Page:
    ids: t.List[t.Any]
    positions: t.List[str]
    values: t.List[t.Any]
    offsets: t.Optional[t.List[int]]
    has_more: bool
    from_start: bool


@dataclass
class OrderHandle:
    """What an opened order needs between calls. ``total`` is set in
    ``SMALL`` mode and ``bounds`` in ``INDEXED`` mode."""

    spec: OrderSpec
    plan: OrderPlan
    version: str
    total: t.Optional[int] = None
    bounds: t.Optional[Bounds] = None
    state: t.Dict[str, t.Any] = field(default_factory=dict)
    #: the data version a page last read, and when (a monotonic time)
    checked: t.Optional[t.Tuple[str, float]] = None
