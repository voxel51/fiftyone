"""
FiftyOne Server Order API: GraphQL types and resolvers.

Nothing here names a database: tokens and positions are opaque strings and
the resolvers call an :class:`OrderBackend` through :class:`OrderService`.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from enum import Enum
import functools
import typing as t

from graphql import GraphQLError
import strawberry as gql

from fiftyone.core.utils import run_sync_task

from fiftyone.server.order.backend import (
    BudgetExceeded,
    OrderError,
    OrderHandle,
    OrderSpec,
    Reason,
    SeekTarget,
)
from fiftyone.server.order.labels import format_label
from fiftyone.server.order.mongo import MongoOrderBackend
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
class RankUnit(Enum):
    SAMPLE = "SAMPLE"
    GROUP = "GROUP"
    DYNAMIC_GROUP = "DYNAMIC_GROUP"


@gql.enum
class OrderStrategy(Enum):
    LIVE = "LIVE"
    SNAPSHOT = "SNAPSHOT"
    LIST = "LIST"


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
    unit: t.Optional[RankUnit] = RankUnit.SAMPLE
    partition: t.Optional[t.List[PartitionKey]] = None


@gql.input
class OrderSeek:
    """Where a page starts: a rank, a fraction of the total, or the first
    sample at or past a sort value in view order."""

    rank: t.Optional[int] = None
    fraction: t.Optional[float] = None
    value: t.Optional[JSON] = gql.UNSET


def seek_target(seek: OrderSeek) -> SeekTarget:
    has_value = seek.value is not gql.UNSET
    return SeekTarget(
        rank=seek.rank,
        fraction=seek.fraction,
        value=seek.value if has_value else None,
        has_value=has_value,
    )


@gql.type
class Boundary:
    rank: int
    position: Position
    value: t.Optional[JSON]
    label: str


@gql.type
class Order:
    token: OrderToken
    total: int
    random_access: bool
    strategy: OrderStrategy
    version: str
    handle: gql.Private[OrderHandle]

    @gql.field
    async def boundaries(self, count: int = 100) -> t.List[Boundary]:
        stored = await _call(get_service().boundaries, self.handle, count)
        sorted_ = bool(self.handle.spec.sort_by)
        return [
            Boundary(
                rank=b.rank,
                position=b.position,
                value=b.value,
                label=format_label(b.value, b.rank, sorted_),
            )
            for b in stored
        ]


@gql.type
class OrderUnavailable:
    reason: Unavailable
    total: t.Optional[int] = None


OpenOrderResult = t.Annotated[
    t.Union[Order, OrderUnavailable], gql.union("OpenOrderResult")
]


@gql.type
class SeekResult:
    position: Position
    rank: int


@gql.type
class OrderStatus:
    stale: bool
    version: str
    total: int


@functools.lru_cache(maxsize=1)
def get_service() -> OrderService:
    return OrderService(MongoOrderBackend())


def to_graphql_error(err: OrderError) -> GraphQLError:
    return GraphQLError(str(err), extensions={"code": err.code})


async def _call(fn, *args):
    try:
        return await run_sync_task(fn, *args)
    except OrderError as err:
        raise to_graphql_error(err) from err


def spec_from_input(input: OrderInput) -> OrderSpec:
    unit = input.unit or RankUnit.SAMPLE
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


async def open_order(input: OrderInput) -> OpenOrderResult:
    spec = spec_from_input(input)
    try:
        opened = await run_sync_task(get_service().open, spec)
    except BudgetExceeded:
        return OrderUnavailable(reason=Unavailable.BUDGET_EXCEEDED)
    except OrderError as err:
        raise to_graphql_error(err) from err

    handle = opened.handle
    if not handle.plan.supports_random_access:
        reason = handle.plan.reason or Reason.UNSUPPORTED_STAGE
        return OrderUnavailable(reason=Unavailable(reason.value))

    return Order(
        token=opened.token,
        total=handle.total,
        random_access=True,
        strategy=OrderStrategy(handle.plan.strategy.value),
        version=handle.version,
        handle=handle,
    )


async def seek_order(
    token: OrderToken,
    rank: t.Optional[int] = None,
    fraction: t.Optional[float] = None,
) -> SeekResult:
    target = SeekTarget(rank=rank, fraction=fraction)
    position, landed = await _call(get_service().seek, token, target)
    return SeekResult(position=position, rank=landed)


async def order_status(token: OrderToken) -> OrderStatus:
    status = await _call(get_service().status, token)
    return OrderStatus(
        stale=status.stale, version=status.version, total=status.total
    )
