"""
FiftyOne Server MongoDB order backend.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import bisect
import hashlib
import typing as t

from bson import MaxKey, MinKey, ObjectId
from pymongo.errors import ExecutionTimeout

import fiftyone.core.fields as fof
import fiftyone.core.odm as foo
import fiftyone.core.stages as fosg
import fiftyone.core.utils as fou

from fiftyone.server.filters import GroupElementFilter, SampleFilter
from fiftyone.server.order.backend import (
    BadPosition,
    Boundary,
    Budget,
    BudgetExceeded,
    Direction,
    OrderHandle,
    OrderPlan,
    OrderSpec,
    Page,
    Reason,
    SeekTarget,
    Strategy,
)
from fiftyone.server.order.boundaries import build_boundaries
from fiftyone.server.order.explain import explain_streams
from fiftyone.server.order.positions import (
    GAP,
    ITEM,
    START,
    Key,
    decode_key,
    encode_key,
)
from fiftyone.server.order.walk import Row, Walker
import fiftyone.server.view as fosv

PLAN_MAX_TIME_MS = 2000

# stages whose order the grid shows when it has no sort of its own
_REORDERING = (fosg.SortBy, fosg.SortBySimilarity, fosg.Shuffle, fosg.GeoNear)


def spec_view(spec: OrderSpec, pagination_data: bool = False):
    """The view an order ranks, without the order's sort."""
    args = spec.view_args()
    sample_filter = None
    if args["group_slice"]:
        slice_ = args["group_slice"]
        sample_filter = SampleFilter(
            group=GroupElementFilter(slice=slice_, slices=[slice_])
        )

    return fosv.get_view(
        args["dataset"],
        stages=args["stages"],
        filters=args["filters"],
        extended_stages=args["extended_stages"],
        dynamic_group=args["dynamic_group"],
        sample_filter=sample_filter,
        pagination_data=pagination_data,
    )


class MongoOrderBackend:
    """Serves LIVE orders: views whose sort runs as one streaming index scan.
    Other views are reported as without random access.
    """

    def plan(self, spec: OrderSpec) -> OrderPlan:
        view = spec_view(spec)
        return self._plan(spec, view)[0]

    def open(self, spec: OrderSpec, budget: Budget) -> OrderHandle:
        view = spec_view(spec)
        plan, path = self._plan(spec, view)
        total = 0
        pipeline = view._pipeline()
        if plan.supports_random_access:
            total = self._count(view, pipeline, budget)

        return OrderHandle(
            spec=spec,
            plan=plan,
            total=total,
            version=self._version(view),
            budget=budget,
            state={"view": view, "pipeline": pipeline, "path": path},
        )

    def boundaries(self, handle: OrderHandle, count: int) -> t.List[Boundary]:
        stored = self._stored(handle)
        if count <= 0 or not stored:
            return []

        if len(stored) <= count:
            return list(stored)

        picked = []
        for i in range(count):
            index = (i * len(stored)) // count
            picked.append(stored[index])

        return picked

    def seek(
        self, handle: OrderHandle, target: SeekTarget
    ) -> t.Tuple[str, int]:
        if handle.total == 0:
            return encode_key(Key(kind=START, rank=0, id=None)), 0

        if target.has_value:
            return self._seek_value(handle, target.value)

        rank = target.rank
        if rank is None:
            fraction = min(max(target.fraction or 0.0, 0.0), 1.0)
            rank = int(fraction * handle.total)

        return self._seek_rank(handle, min(max(rank, 0), handle.total - 1))

    def _seek_rank(self, handle: OrderHandle, rank: int) -> t.Tuple[str, int]:
        """Walks from the nearest stored boundary at or before ``rank``, at
        most one boundary step."""
        stored = self._stored(handle)
        index = bisect.bisect_right([b.rank for b in stored], rank) - 1
        boundary = stored[max(index, 0)]
        if boundary.rank == rank:
            return boundary.position, rank

        key = decode_key(boundary.position)
        o = -1 if handle.spec.desc else 1
        rows = self._walker(handle).walk(
            _walk_start(key), True, o, rank - boundary.rank + 1
        )
        if not rows:
            return boundary.position, boundary.rank

        row = rows[-1]
        rank = boundary.rank + len(rows) - 1
        position = Key(
            kind=GAP,
            rank=rank,
            id=row.id,
            segment=row.segment,
            value=row.value,
        )
        return encode_key(position), rank

    def _seek_value(self, handle: OrderHandle, value) -> t.Tuple[str, int]:
        """The first sample at or past ``value`` in view order. Its rank is a
        count of the samples before it."""
        path = handle.state["path"]
        if path is None:
            raise BadPosition("a value seek needs a sorted order")

        value = _coerce(handle.state["view"], handle.spec.sort_by, value)
        segment = 0 if value is None else 1
        desc = bool(handle.spec.desc)
        # an id bound that admits every sample of the value's tie block
        bound = MaxKey() if desc else MinKey()
        if segment == 0:
            before = {path: {"$ne": None}} if desc else None
        elif desc:
            before = {path: {"$gt": value}}
        else:
            before = {"$or": [{path: None}, {path: {"$lt": value}}]}

        rank = self._count_where(handle, before) if before else 0
        key = Key(kind=GAP, rank=rank, id=bound, segment=segment, value=value)
        return encode_key(key), rank

    def _count_where(self, handle: OrderHandle, match: dict) -> int:
        coll = handle.state["view"]._dataset._sample_collection
        pipeline = handle.state["pipeline"] + [
            {"$match": match},
            {"$count": "n"},
        ]
        try:
            result = list(
                coll.aggregate(pipeline, maxTimeMS=handle.budget.max_time_ms)
            )
        except ExecutionTimeout as err:
            raise BudgetExceeded("counting the view took too long") from err

        return result[0]["n"] if result else 0

    def page(
        self,
        handle: OrderHandle,
        position: t.Optional[str],
        direction: Direction,
        limit: int,
    ) -> Page:
        key = _start_key(position)
        forward = direction == Direction.FORWARD
        desc = bool(handle.spec.desc)
        # the walk moves through ascending (value, _id) order
        o = 1 if forward != desc else -1
        walker = self._walker(handle)
        start = _walk_start(key)
        inclusive = key is not None and key.kind == GAP and forward
        rows = walker.walk(start, inclusive, o, limit + 1)

        has_more = len(rows) > limit
        rows = rows[:limit]
        ranks = _ranks(key, forward, len(rows), handle.total)
        positions = [
            encode_key(
                Key(
                    kind=ITEM,
                    rank=rank,
                    id=row.id,
                    segment=row.segment,
                    value=row.value,
                )
            )
            for row, rank in zip(rows, ranks)
        ]
        ids = [row.id for row in rows]
        if not forward:
            ids.reverse()
            positions.reverse()
            ranks.reverse()

        return Page(
            ids=ids, positions=positions, ranks=ranks, has_more=has_more
        )

    def version(self, handle: OrderHandle) -> str:
        return self._version(handle.state["view"])

    def release(self, handle: OrderHandle) -> None:
        """LIVE orders hold no database resources, and a released handle may
        still be serving a page on another thread."""

    def _plan(
        self, spec: OrderSpec, view
    ) -> t.Tuple[OrderPlan, t.Optional[str]]:
        unavailable = lambda reason: (
            OrderPlan(
                strategy=None, supports_random_access=False, reason=reason
            ),
            None,
        )
        if spec.unit != "SAMPLE" or spec.partition or spec.dynamic_group:
            return unavailable(Reason.UNSUPPORTED_STAGE)

        stages = view._stages
        if any(isinstance(s, fosg.GroupBy) for s in stages):
            return unavailable(Reason.UNSUPPORTED_STAGE)

        if any(_is_ordered_select(s) for s in stages):
            return unavailable(Reason.UNSUPPORTED_STAGE)

        path = None
        if spec.sort_by:
            if view._is_frame_field(spec.sort_by):
                return unavailable(Reason.FRAME_SORT)

            path = _sort_path(view, spec.sort_by)
            if path is None:
                return unavailable(Reason.UNSUPPORTED_STAGE)
        elif any(isinstance(s, _REORDERING) for s in stages):
            return unavailable(Reason.UNSUPPORTED_STAGE)

        if not self._streams(view, path, spec.desc):
            return unavailable(Reason.UNSUPPORTED_STAGE)

        return (
            OrderPlan(strategy=Strategy.LIVE, supports_random_access=True),
            path,
        )

    def _streams(self, view, path: t.Optional[str], desc: bool) -> bool:
        """Whether the view's sort runs as one index scan with no blocking
        sort, which is what makes a seek cost independent of the view size.
        """
        o = -1 if desc else 1
        field = path or "_id"
        pipeline = view._pipeline() + [{"$sort": {field: o}}, {"$limit": 20}]
        coll = view._dataset._sample_collection
        try:
            explain = coll.database.command(
                "aggregate",
                coll.name,
                pipeline=pipeline,
                explain=True,
                maxTimeMS=PLAN_MAX_TIME_MS,
            )
        except ExecutionTimeout:
            return False

        return explain_streams(explain, field)

    def _count(self, view, pipeline, budget: Budget) -> int:
        coll = view._dataset._sample_collection
        try:
            result = list(
                coll.aggregate(
                    pipeline + [{"$count": "n"}],
                    allowDiskUse=True,
                    maxTimeMS=budget.max_time_ms,
                )
            )
        except ExecutionTimeout as err:
            raise BudgetExceeded("counting the view took too long") from err

        return result[0]["n"] if result else 0

    def _version(self, view) -> str:
        coll = view._dataset._sample_collection
        latest = next(
            coll.find({}, {"last_modified_at": 1})
            .sort("last_modified_at", -1)
            .limit(1),
            {},
        ).get("last_modified_at")
        doc = foo.get_db_conn().datasets.find_one(
            {"_id": view._root_dataset._doc.id}, {"last_deletion_at": 1}
        )
        deleted = (doc or {}).get("last_deletion_at")
        count = coll.estimated_document_count()
        raw = f"{latest}|{deleted}|{count}"
        return hashlib.sha1(raw.encode()).hexdigest()[:16]

    def _walker(self, handle: OrderHandle) -> Walker:
        view = handle.state["view"]
        return Walker(
            view._dataset._sample_collection,
            handle.state["pipeline"],
            handle.state["path"],
        )

    def _stored(self, handle: OrderHandle) -> t.List[Boundary]:
        stored = handle.state.get("boundaries")
        if stored is None:
            stored = build_boundaries(handle)
            handle.state["boundaries"] = stored

        return stored


def _start_key(position: t.Optional[str]) -> t.Optional[Key]:
    if position is None:
        return None

    key = decode_key(position)
    return None if key.kind == START else key


def _walk_start(key: t.Optional[Key]) -> t.Optional[Row]:
    if key is None:
        return None

    return Row(segment=key.segment, value=key.value, id=key.id)


def _ranks(
    key: t.Optional[Key], forward: bool, count: int, total: int
) -> t.List[int]:
    if forward:
        if key is None:
            first = 0
        elif key.kind == GAP:
            first = key.rank
        else:
            first = key.rank + 1

        return [first + i for i in range(count)]

    if key is None:
        last = total - 1
    else:
        last = key.rank - 1

    return [last - i for i in range(count)]


def _is_ordered_select(stage) -> bool:
    return isinstance(stage, (fosg.Select, fosg.SelectBy)) and bool(
        getattr(stage, "ordered", False)
    )


def _sort_path(view, field_name: str) -> t.Optional[str]:
    """The database path of a sortable field, or None when a list lies on
    the path (lists have no value seek)."""
    try:
        path, _, unwind, other, _ = view._parse_field_name(
            field_name, auto_unwind=False, omit_terminal_lists=False
        )
    except ValueError:
        return None

    if unwind or other:
        return None

    field = view.get_field(field_name)
    if isinstance(
        field,
        (
            fof.ListField,
            fof.DictField,
            fof.VectorField,
            fof.EmbeddedDocumentField,
        ),
    ):
        return None

    return path


def _coerce(view, field_name: str, value):
    """A JSON seek value as the field stores it."""
    field = view.get_field(field_name)
    if value is None:
        return None

    if isinstance(field, (fof.DateTimeField, fof.DateField)) and isinstance(
        value, (int, float)
    ):
        dt = fou.timestamp_to_datetime(value)
        return dt if isinstance(field, fof.DateTimeField) else dt.date()

    if isinstance(field, fof.ObjectIdField) and isinstance(value, str):
        try:
            return ObjectId(value)
        except Exception as err:
            raise BadPosition("invalid id value") from err

    return value
