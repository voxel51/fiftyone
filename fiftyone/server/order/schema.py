"""
FiftyOne Server Order API: GraphQL types and resolvers.

Tokens and positions are opaque strings. Every resolver runs its queries
under a time limit and kills them when the request is abandoned.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from enum import Enum
import functools
import typing as t

from graphql import GraphQLError
import strawberry as gql

import fiftyone as fo

from fiftyone.server.data import Info
from fiftyone.server.exceptions import QueryTimeout
from fiftyone.server.order.backend import (
    BudgetExceeded,
    OrderError,
    OrderHandle,
    OrderSpec,
    Reason,
    SeekTarget,
)
from fiftyone.server.order.cancel import run_bounded
from fiftyone.server.order.mongo import MongoOrderBackend
from fiftyone.server.order.rail import (
    DEFAULT_TICKS,
    offset_ticks,
    value_ticks,
)
from fiftyone.server.order.service import OrderService
from fiftyone.server.scalars import BSON, BSONArray, JSON

OrderToken = gql.scalar(
    t.NewType("OrderToken", str),
    description="One ordering of one view. Opaque.",
    serialize=str,
    parse_value=str,
)

Position = gql.scalar(
    t.NewType("Position", str),
    description="A place in an ordering. Opaque.",
    serialize=str,
    parse_value=str,
)


@gql.enum
class OrderUnit(Enum):
    SAMPLE = "SAMPLE"
    GROUP = "GROUP"
    DYNAMIC_GROUP = "DYNAMIC_GROUP"


@gql.enum(
    description=(
        "SMALL: at most 100,000 samples in the collection, addressed by "
        "offset. INDEXED: an index serves the sort and the filter, so the "
        "order seeks by value. SCROLL: pages in order only."
    )
)
class OrderMode(Enum):
    SMALL = "SMALL"
    INDEXED = "INDEXED"
    SCROLL = "SCROLL"


@gql.enum
class OrderScale(Enum):
    NUMBER = "NUMBER"
    DATE = "DATE"
    ID = "ID"


@gql.enum
class Unavailable(Enum):
    BUDGET_EXCEEDED = "BUDGET_EXCEEDED"
    FRAME_SORT = "FRAME_SORT"
    UNSUPPORTED_STAGE = "UNSUPPORTED_STAGE"


@gql.input
class PartitionKey:
    path: str
    value: t.Optional[JSON] = None


@gql.input
class OrderInput:
    dataset: str
    view: BSONArray
    filters: t.Optional[BSON] = None
    extended_stages: t.Optional[BSON] = None
    group_slice: t.Optional[str] = None
    dynamic_group: t.Optional[BSON] = None
    sort_by: t.Optional[str] = None
    desc: t.Optional[bool] = False
    unit: t.Optional[OrderUnit] = OrderUnit.SAMPLE
    partition: t.Optional[t.List[PartitionKey]] = None


@gql.input(
    description=(
        "Where a page starts: an offset (SMALL), a fraction of the rail "
        "(SMALL, or INDEXED with a scale), or the first sample at or past a "
        "sort value in view order (SMALL, INDEXED)."
    )
)
class OrderSeek:
    offset: t.Optional[int] = None
    fraction: t.Optional[float] = None
    value: t.Optional[JSON] = gql.UNSET


def seek_target(seek: OrderSeek) -> SeekTarget:
    has_value = seek.value is not gql.UNSET
    return SeekTarget(
        offset=seek.offset,
        fraction=seek.fraction,
        value=seek.value if has_value else None,
        has_value=has_value,
    )


@gql.type
class OrderBounds:
    min: t.Optional[JSON]
    max: t.Optional[JSON]
    has_none: bool
    scale: t.Optional[OrderScale] = gql.field(
        description="None when values do not map onto a rail (strings and "
        "booleans): such orders seek by value only"
    )


@gql.type
class OrderTick:
    value: t.Optional[JSON]
    fraction: float
    label: str


@gql.type
class Order:
    token: OrderToken
    mode: OrderMode
    version: str
    handle: gql.Private[OrderHandle]
    total: t.Optional[int] = gql.field(description="SMALL only")
    bounds: t.Optional[OrderBounds] = gql.field(description="INDEXED only")

    @gql.field(
        description="Evenly spaced ticks: offsets in SMALL mode, round "
        "numbers or calendar steps in INDEXED mode, none in SCROLL mode"
    )
    def ticks(self, count: int = DEFAULT_TICKS) -> t.List[OrderTick]:
        handle = self.handle
        if handle.total is not None:
            ticks = offset_ticks(handle.total, count)
        elif handle.bounds is not None:
            ticks = value_ticks(handle.bounds, handle.spec.desc, count)
        else:
            ticks = []

        return [
            OrderTick(
                value=tick.value, fraction=tick.fraction, label=tick.label
            )
            for tick in ticks
        ]


@gql.type
class OrderUnavailable:
    reason: Unavailable


OpenOrderResult = t.Annotated[
    t.Union[Order, OrderUnavailable], gql.union("OpenOrderResult")
]


@gql.type
class OrderStatus:
    stale: bool
    version: str
    total: t.Optional[int] = gql.field(description="SMALL only")


@gql.type
class SamplePositionValue:
    value: int


SamplePositionPart = t.Annotated[
    t.Union[SamplePositionValue, QueryTimeout],
    gql.union("SamplePositionPart"),
]


@gql.type
class SamplePosition:
    """A sample's offset in its view's order and the view's total, each
    counted separately under the App's query time limit."""

    spec: gql.Private[OrderSpec]
    sample_id: gql.Private[t.Optional[str]]
    group_id: gql.Private[t.Optional[str]]

    @gql.field(
        description="How many samples sort before the sample, or null when "
        "the view does not hold it or cannot be ordered"
    )
    async def offset(
        self, info: Info = None
    ) -> t.Optional[SamplePositionPart]:
        return await _timed_count(
            info,
            get_service().backend.sample_offset,
            self.spec,
            self.sample_id,
            self.group_id,
        )

    @gql.field
    async def total(self, info: Info = None) -> SamplePositionPart:
        return await _timed_count(
            info, get_service().backend.view_total, self.spec
        )


@functools.lru_cache(maxsize=1)
def get_service() -> OrderService:
    return OrderService(MongoOrderBackend())


def to_graphql_error(err: OrderError) -> GraphQLError:
    return GraphQLError(str(err), extensions={"code": err.code})


def get_request(info: t.Optional[Info]):
    return info.context.request if info is not None else None


async def call(info: t.Optional[Info], fn, *args):
    """Runs an order call as a bounded request, raising order errors as
    GraphQL errors."""
    try:
        return await run_bounded(get_request(info), fn, *args)
    except OrderError as err:
        raise to_graphql_error(err) from err


def spec_from_input(input: OrderInput) -> OrderSpec:
    unit = input.unit or OrderUnit.SAMPLE
    return OrderSpec(
        dataset=input.dataset,
        stages=input.view or [],
        filters=input.filters,
        extended_stages=input.extended_stages,
        group_slice=input.group_slice,
        dynamic_group=input.dynamic_group,
        sort_by=input.sort_by,
        desc=bool(input.desc),
        unit=unit.value,
        partition=(
            [{"path": p.path, "value": p.value} for p in input.partition]
            if input.partition
            else None
        ),
    )


async def open_order(
    input: OrderInput, info: t.Optional[Info] = None
) -> OpenOrderResult:
    spec = spec_from_input(input)
    try:
        opened = await run_bounded(get_request(info), get_service().open, spec)
    except BudgetExceeded:
        return OrderUnavailable(reason=Unavailable.BUDGET_EXCEEDED)
    except OrderError as err:
        raise to_graphql_error(err) from err

    handle = opened.handle
    if handle.plan.mode is None:
        reason = handle.plan.reason or Reason.UNSUPPORTED_STAGE
        return OrderUnavailable(reason=Unavailable(reason.value))

    bounds = None
    if handle.bounds is not None:
        b = handle.bounds
        bounds = OrderBounds(
            min=b.min,
            max=b.max,
            has_none=b.has_none,
            scale=OrderScale(b.scale.value) if b.scale else None,
        )

    return Order(
        token=opened.token,
        mode=OrderMode(handle.plan.mode.value),
        version=handle.version,
        total=handle.total,
        bounds=bounds,
        handle=handle,
    )


async def order_status(
    token: OrderToken, info: t.Optional[Info] = None
) -> OrderStatus:
    status = await call(info, get_service().status, token)
    return OrderStatus(
        stale=status.stale, version=status.version, total=status.total
    )


def sample_position(
    input: OrderInput,
    sample_id: t.Optional[str] = None,
    group_id: t.Optional[str] = None,
) -> SamplePosition:
    if (sample_id is None) == (group_id is None):
        raise GraphQLError("pass one of sampleId or groupId")

    return SamplePosition(
        spec=spec_from_input(input), sample_id=sample_id, group_id=group_id
    )


async def _timed_count(info, fn, *args):
    query_time = fo.app_config.max_query_time
    try:
        value = await run_bounded(
            get_request(info), fn, *args, max_time_ms=query_time * 1000
        )
    except BudgetExceeded:
        return QueryTimeout(query_time=query_time)
    except OrderError as err:
        raise to_graphql_error(err) from err

    return None if value is None else SamplePositionValue(value=value)
