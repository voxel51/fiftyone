"""
FiftyOne Server MongoDB order backend.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import contextlib
import hashlib
import typing as t

from bson import MaxKey, MinKey, ObjectId
from pymongo.errors import ExecutionTimeout, OperationFailure

import fiftyone.core.fields as fof
import fiftyone.core.odm as foo
import fiftyone.core.stages as fosg
import fiftyone.core.utils as fou

from fiftyone.server.filters import GroupElementFilter, SampleFilter
import fiftyone.server.lightning as fosl
from fiftyone.server.order.backend import (
    BadPosition,
    Bounds,
    Budget,
    BudgetExceeded,
    Cancelled,
    Direction,
    Mode,
    OrderHandle,
    OrderPlan,
    OrderSpec,
    Page,
    Reason,
    Scale,
    SeekNotAllowed,
    SeekTarget,
)
from fiftyone.server.order.explain import explain_serves
from fiftyone.server.order.positions import (
    GAP,
    ITEM,
    START,
    Key,
    decode_key,
    encode_key,
)
from fiftyone.server.order.rail import scale_of, value_at
from fiftyone.server.order.walk import Row, Walker
import fiftyone.server.view as fosv

#: collections of at most this many documents are addressed by offset
SMALL_COLLECTION_SIZE = 100000

PLAN_MAX_TIME_MS = 2000

_INTERRUPTED = 11601

# stages whose order the grid shows when it has no sort of its own
_REORDERING = (fosg.SortBy, fosg.SortBySimilarity, fosg.Shuffle, fosg.GeoNear)

# stages that only shape documents, which an order never reads
_PROJECTIONS = {
    "fiftyone.core.stages.ExcludeFields",
    "fiftyone.core.stages.SelectFields",
}


def spec_view(spec: OrderSpec, pagination_data: bool = False):
    """The view an order sorts, without the order's sort."""
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


def order_view(spec: OrderSpec):
    """The view whose pipeline order queries run: :func:`spec_view` without
    its projections, which can keep MongoDB from streaming a sort."""
    stages = [
        s for s in spec.stages or [] if s.get("_cls") not in _PROJECTIONS
    ]
    return spec_view(
        OrderSpec(**{**spec.to_dict(), "stages": stages}),
    )


@contextlib.contextmanager
def bounded(budget: Budget):
    """Raises a timed out query as :class:`BudgetExceeded` and a killed one
    as :class:`Cancelled`."""
    try:
        yield
    except ExecutionTimeout as err:
        raise BudgetExceeded("the query took too long") from err
    except OperationFailure as err:
        if budget.cancelled:
            raise Cancelled("the request was abandoned") from err

        if err.code == _INTERRUPTED:
            raise BudgetExceeded("the query was interrupted") from err

        raise


class MongoOrderBackend(object):
    """Orders the samples of a view: the sort value, then the sample id,
    both reversed when descending. Unsorted views order by id.
    """

    def open(self, spec: OrderSpec, budget: Budget) -> OrderHandle:
        view = order_view(spec)
        with bounded(budget):
            plan = self._plan(spec, view, budget)
            pipeline = view._pipeline()
            handle = OrderHandle(
                spec=spec,
                plan=plan,
                version=self._version(view, budget),
                state={"view": view, "pipeline": pipeline},
            )
            if plan.mode == Mode.SMALL:
                handle.total = self._count(handle, None, budget)
            elif plan.mode == Mode.INDEXED:
                handle.bounds = self._bounds(handle, budget)

        return handle

    def seek(
        self, handle: OrderHandle, target: SeekTarget, budget: Budget
    ) -> str:
        """The place just before the target sample. A forward page from it
        starts at the target."""
        mode = handle.plan.mode
        if mode not in (Mode.SMALL, Mode.INDEXED):
            raise SeekNotAllowed("this order pages in order only")

        with bounded(budget):
            if mode == Mode.SMALL:
                return self._seek_small(handle, target, budget)

            return self._seek_indexed(handle, target)

    def page(
        self,
        handle: OrderHandle,
        position: t.Optional[str],
        direction: Direction,
        limit: int,
        budget: Budget,
    ) -> Page:
        key = _start_key(position)
        forward = direction == Direction.FORWARD
        if key is None and not forward and handle.plan.mode == Mode.SCROLL:
            raise SeekNotAllowed("this order pages forward from its start")

        desc = bool(handle.spec.desc)
        # the walk moves through ascending (value, _id) order
        o = 1 if forward != desc else -1
        inclusive = key is not None and key.kind == GAP and forward
        with bounded(budget):
            rows = self._walker(handle, budget).walk(
                _walk_start(key), inclusive, o, limit + 1
            )

        has_more = len(rows) > limit
        rows = rows[:limit]
        offsets = _offsets(key, forward, len(rows), handle.total)
        positions = [
            encode_key(
                Key(
                    kind=ITEM,
                    offset=offsets[i] if offsets else None,
                    id=row.id,
                    segment=row.segment,
                    value=row.value,
                )
            )
            for i, row in enumerate(rows)
        ]
        ids = [row.id for row in rows]
        values = [row.value if handle.plan.path else row.id for row in rows]
        if not forward:
            for items in (ids, positions, values, offsets):
                if items:
                    items.reverse()

        return Page(
            ids=ids,
            positions=positions,
            values=values,
            offsets=offsets,
            has_more=has_more,
            from_start=forward and key is None,
        )

    def version(self, handle: OrderHandle, budget: Budget) -> str:
        with bounded(budget):
            return self._version(handle.state["view"], budget)

    def sample_offset(
        self,
        spec: OrderSpec,
        sample_id: t.Optional[str],
        group_id: t.Optional[str],
        budget: Budget,
    ) -> t.Optional[int]:
        """How many samples sort before a sample of the view, or None when
        the view does not hold it or the order is unsupported."""
        view = order_view(spec)
        plan = _supported(spec, view)
        if plan.reason is not None:
            return None

        if group_id is not None:
            group_field = view._dataset.group_field
            if group_field is None:
                raise BadPosition("the view has no groups")

            match = {group_field + "._id": _object_id(group_id)}
        else:
            match = {"_id": _object_id(sample_id)}

        pipeline = view._pipeline() + [
            {"$match": match},
            {"$project": {plan.path or "_id": 1}},
            {"$limit": 1},
        ]
        coll = view._dataset._sample_collection
        with bounded(budget):
            docs = list(coll.aggregate(pipeline, **budget.options()))
            if not docs:
                return None

            value = _get(docs[0], plan.path) if plan.path else None
            before = _before(plan.path, spec.desc, value, docs[0]["_id"])
            return _count_view(view, view._pipeline(), before, budget)

    def view_total(self, spec: OrderSpec, budget: Budget) -> int:
        view = order_view(spec)
        with bounded(budget):
            return _count_view(view, view._pipeline(), None, budget)

    def _plan(self, spec: OrderSpec, view, budget: Budget) -> OrderPlan:
        plan = _supported(spec, view)
        if plan.reason is not None:
            return plan

        size = view._dataset._sample_collection.estimated_document_count()
        if size <= SMALL_COLLECTION_SIZE:
            plan.mode = Mode.SMALL
        elif self._served(view, plan.path, spec.desc, budget):
            plan.mode = Mode.INDEXED
        else:
            plan.mode = Mode.SCROLL

        return plan

    def _served(self, view, path, desc: bool, budget: Budget) -> bool:
        """Whether an index serves the sort and the view's filter, from one
        explain of a page query."""
        field = path or "_id"
        pipeline = view._pipeline() + [
            {"$match": {field: {"$ne": None}}},
            {"$sort": {field: -1 if desc else 1}},
            {"$limit": 1},
        ]
        coll = view._dataset._sample_collection
        options = {**budget.options(), "maxTimeMS": PLAN_MAX_TIME_MS}
        try:
            explain = coll.database.command(
                "aggregate",
                coll.name,
                pipeline=pipeline,
                explain=True,
                **options,
            )
        except ExecutionTimeout:
            return False

        return explain_serves(explain, field)

    def _bounds(self, handle: OrderHandle, budget: Budget) -> Bounds:
        """The first and last keys of the sort index, and whether any sort
        value is None: three index lookups."""
        view = handle.state["view"]
        path = handle.plan.path
        field = view.get_field(handle.spec.sort_by) if path else None
        coll = view._dataset._sample_collection
        run = lambda stages: list(
            coll.aggregate(
                handle.state["pipeline"] + stages, **budget.options()
            )
        )
        f = path or "_id"
        lo = fosl._parse_result(run(fosl._first(f, view, 1, False)))
        hi = fosl._parse_result(run(fosl._first(f, view, -1, False)))
        has_none = bool(path) and bool(run(fosl._match(f, None)))
        return Bounds(
            min=lo,
            max=hi,
            has_none=has_none,
            scale=scale_of(field) if path else Scale.ID,
        )

    def _seek_small(
        self, handle: OrderHandle, target: SeekTarget, budget: Budget
    ) -> str:
        total = handle.total
        if total == 0:
            return encode_key(Key(kind=START, offset=0, id=None))

        if target.has_value:
            key = _value_key(handle, _coerce(handle, target.value))
            path = handle.plan.path
            if path is None:
                before = _before(None, handle.spec.desc, None, key.id)
            else:
                before = _before(path, handle.spec.desc, key.value, None)

            offset = self._count(handle, before, budget)
            return encode_key(
                Key(
                    kind=GAP,
                    offset=offset,
                    id=key.id,
                    segment=key.segment,
                    value=key.value,
                )
            )

        offset = target.offset
        if offset is None:
            offset = int(min(max(target.fraction or 0.0, 0.0), 1.0) * total)

        offset = min(max(offset, 0), total - 1)
        row = self._row_at(handle, offset, budget)
        return encode_key(
            Key(
                kind=GAP,
                offset=offset,
                id=row.id,
                segment=row.segment,
                value=row.value,
            )
        )

    def _seek_indexed(self, handle: OrderHandle, target: SeekTarget) -> str:
        if target.offset is not None:
            raise SeekNotAllowed("an indexed order seeks by value")

        if target.has_value:
            return encode_key(
                _value_key(handle, _coerce(handle, target.value))
            )

        if handle.bounds.scale is None:
            raise SeekNotAllowed("this sort has no scale to seek on")

        if (target.fraction or 0.0) <= 0.0 or handle.bounds.min is None:
            return encode_key(Key(kind=START, offset=None, id=None))

        value = value_at(target.fraction, handle.bounds, handle.spec.desc)
        return encode_key(_value_key(handle, value))

    def _row_at(self, handle: OrderHandle, offset: int, budget: Budget) -> Row:
        """The sample at an offset of a ``SMALL`` order."""
        path = handle.plan.path
        o = -1 if handle.spec.desc else 1
        if path:
            stages = [
                {"$project": {path: 1}},
                {"$sort": {path: o, "_id": o}},
            ]
        else:
            stages = [{"$project": {"_id": 1}}, {"$sort": {"_id": o}}]

        coll = handle.state["view"]._dataset._sample_collection
        docs = list(
            coll.aggregate(
                handle.state["pipeline"]
                + stages
                + [{"$skip": offset}, {"$limit": 1}],
                allowDiskUse=True,
                **budget.options(),
            )
        )
        if not docs:
            raise BadPosition("no sample at that offset")

        value = _get(docs[0], path) if path else None
        return Row(
            segment=0 if path and value is None else 1,
            value=value,
            id=docs[0]["_id"],
        )

    def _count(self, handle: OrderHandle, match, budget: Budget) -> int:
        return _count_view(
            handle.state["view"], handle.state["pipeline"], match, budget
        )

    def _version(self, view, budget: Budget) -> str:
        coll = view._dataset._sample_collection
        options = {
            "max_time_ms": budget.max_time_ms,
            "comment": budget.comment,
        }
        latest = next(
            coll.find({}, {"last_modified_at": 1}, **options)
            .sort("last_modified_at", -1)
            .limit(1),
            {},
        ).get("last_modified_at")
        doc = foo.get_db_conn().datasets.find_one(
            {"_id": view._root_dataset._doc.id},
            {"last_deletion_at": 1},
            **options,
        )
        deleted = (doc or {}).get("last_deletion_at")
        count = coll.estimated_document_count()
        raw = f"{latest}|{deleted}|{count}"
        return hashlib.sha1(raw.encode()).hexdigest()[:16]

    def _walker(self, handle: OrderHandle, budget: Budget) -> Walker:
        view = handle.state["view"]
        return Walker(
            view._dataset._sample_collection,
            handle.state["pipeline"],
            handle.plan.path,
            budget,
        )


def indexed_sort_fields(collection, indexes) -> t.List[str]:
    """The fields that lead an index and can be sorted by, which are the
    fields an index can serve a sort of.

    Args:
        collection: a :class:`fiftyone.core.collections.SampleCollection`
        indexes: the collection's sample
            :class:`fiftyone.server.indexes.Index` list

    Returns:
        a list of field names
    """
    db_fields = collection._get_db_fields_map(reverse=True) or {}
    fields = []
    for index in indexes or []:
        path = index.key[0].field
        name = db_fields.get(path, path)
        if name not in fields and _sort_path(collection, name) is not None:
            fields.append(name)

    return fields


def _count_view(view, pipeline, match, budget: Budget) -> int:
    budget.check()
    stages = [{"$match": match}] if match else []
    coll = view._dataset._sample_collection
    result = list(
        coll.aggregate(
            pipeline + stages + [{"$count": "n"}], **budget.options()
        )
    )
    return result[0]["n"] if result else 0


def _supported(spec: OrderSpec, view) -> OrderPlan:
    """The order's sort path, or the reason the view cannot be ordered."""
    unavailable = lambda reason: OrderPlan(mode=None, reason=reason)
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

    return OrderPlan(mode=None, path=path)


def _before(path, desc: bool, value, _id) -> dict:
    """A match for the samples that sort before ``(value, _id)``. A None
    ``_id`` places the target before every sample of its value."""
    if path is None:
        return {"_id": {"$gt" if desc else "$lt": _id}}

    ties = (
        [{path: value, "_id": {"$gt" if desc else "$lt": _id}}]
        if _id is not None
        else []
    )
    if value is None:
        before = [{path: {"$ne": None}}] if desc else []
    elif desc:
        before = [{path: {"$gt": value}}]
    else:
        before = [{path: None}, {path: {"$lt": value}}]

    clauses = before + ties
    if not clauses:
        return {"_id": {"$exists": False}}

    return {"$or": clauses}


def _value_key(handle: OrderHandle, value) -> Key:
    """The place just before the first sample at or past a sort value. Its
    id bound admits every sample of the value's tie block; unsorted orders
    seek an id."""
    if handle.plan.path is None:
        return Key(kind=GAP, offset=None, id=value, segment=1, value=None)

    return Key(
        kind=GAP,
        offset=None,
        id=MaxKey() if handle.spec.desc else MinKey(),
        segment=0 if value is None else 1,
        value=value,
    )


def _get(doc: dict, path: str):
    value = doc
    for part in path.split("."):
        if not isinstance(value, dict):
            return None
        value = value.get(part)

    return value


def _start_key(position: t.Optional[str]) -> t.Optional[Key]:
    if position is None:
        return None

    key = decode_key(position)
    return None if key.kind == START else key


def _walk_start(key: t.Optional[Key]) -> t.Optional[Row]:
    if key is None:
        return None

    return Row(segment=key.segment, value=key.value, id=key.id)


def _offsets(
    key: t.Optional[Key], forward: bool, count: int, total: t.Optional[int]
) -> t.Optional[t.List[int]]:
    """The offsets of a page's samples, when the order knows them."""
    if total is None or (key is not None and key.offset is None):
        return None

    if forward:
        if key is None:
            first = 0
        elif key.kind == GAP:
            first = key.offset
        else:
            first = key.offset + 1

        return [first + i for i in range(count)]

    last = total - 1 if key is None else key.offset - 1
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


def _object_id(value: str) -> ObjectId:
    try:
        return ObjectId(value)
    except Exception as err:
        raise BadPosition("invalid id") from err


def _coerce(handle: OrderHandle, value):
    """A JSON seek value as the field stores it."""
    if value is None:
        return None

    if handle.plan.path is None:
        return _object_id(value)

    field = handle.state["view"].get_field(handle.spec.sort_by)
    if isinstance(field, (fof.DateTimeField, fof.DateField)):
        if isinstance(value, dict) and value.get("_cls") == "DateTime":
            value = value.get("datetime")

        if isinstance(value, (int, float)):
            return fou.timestamp_to_datetime(value)

    if isinstance(field, fof.ObjectIdField) and isinstance(value, str):
        return _object_id(value)

    return value
