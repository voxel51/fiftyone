"""
FiftyOne Server order backend protocol.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from dataclasses import dataclass, field
from enum import Enum
import hashlib
import typing as t

from bson import json_util


class Strategy(str, Enum):
    LIVE = "LIVE"
    SNAPSHOT = "SNAPSHOT"
    LIST = "LIST"


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


class BudgetExceeded(OrderError):
    code = "BUDGET_EXCEEDED"


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
        return _digest(
            {
                **self.view_args(),
                "sort_by": self.sort_by,
                "desc": bool(self.desc),
                "unit": self.unit,
                "partition": self.partition,
            }
        )

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
    """Where a seek lands: a rank, a fraction of the total, or the first
    sample at or past a sort value (``has_value`` tells None from unset)."""

    rank: t.Optional[int] = None
    fraction: t.Optional[float] = None
    value: t.Any = None
    has_value: bool = False


@dataclass
class Budget:
    max_time_ms: int = 10000


@dataclass
class OrderPlan:
    strategy: t.Optional[Strategy]
    supports_random_access: bool
    reason: t.Optional[Reason] = None
    exact_total: bool = True
    live: bool = True
    boundary_values: bool = True


@dataclass
class Boundary:
    rank: int
    position: str
    value: t.Any


@dataclass
class Page:
    ids: t.List[t.Any]
    positions: t.List[str]
    ranks: t.List[int]
    has_more: bool


@dataclass
class OrderHandle:
    """What an opened order needs between calls. Backends may attach their
    own state to ``state``."""

    spec: OrderSpec
    plan: OrderPlan
    total: int
    version: str
    budget: Budget = field(default_factory=Budget)
    state: t.Dict[str, t.Any] = field(default_factory=dict)


class OrderBackend(t.Protocol):
    """Ranks the samples of a view in a total order: the sort value, then the
    sample id, both reversed when descending. Unsorted views order by id.
    """

    def plan(self, spec: OrderSpec) -> OrderPlan: ...

    def open(self, spec: OrderSpec, budget: Budget) -> OrderHandle: ...

    def boundaries(
        self, handle: OrderHandle, count: int
    ) -> t.List[Boundary]: ...

    def seek(
        self, handle: OrderHandle, target: SeekTarget
    ) -> t.Tuple[str, int]:
        """The place just before the target sample, and its rank. A forward
        page from it starts at the target."""

    def page(
        self,
        handle: OrderHandle,
        position: t.Optional[str],
        direction: Direction,
        limit: int,
    ) -> Page: ...

    def version(self, handle: OrderHandle) -> str:
        """A fingerprint of the data under the handle's view now."""

    def release(self, handle: OrderHandle) -> None: ...
