"""
Mongo pipeline builders for the lightning fast-path queries.

These helpers translate :class:`fiftyone.server.lightning.LightningPathInput`
entries into Motor / MongoDB aggregation pipelines and resolve the raw
results back into :class:`fiftyone.server.lightning.LightningResult`
GraphQL types. Used exclusively by
:class:`fiftyone.server.db.mongo.MongoGridAdapter`.

Lives under ``fiftyone/server/db/`` (rather than next to the GraphQL
resolver in ``fiftyone/server/lightning.py``) so that the Mongo adapter
can import them at module top without circling through the resolver
back into the adapter factory.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from __future__ import annotations

import asyncio
from dataclasses import asdict, dataclass
import re
import typing as t

from bson import ObjectId
from bson.errors import InvalidId
from motor.motor_asyncio import AsyncIOMotorCollection
from pymongo import ASCENDING, DESCENDING
from pymongo.errors import OperationFailure

import fiftyone as fo
import fiftyone.core.fields as fof
import fiftyone.core.odm as foo

from fiftyone.server.lightning import (
    BooleanLightningResult,
    DateLightningResult,
    DateTimeLightningResult,
    FloatLightningResult,
    IntLightningResult,
    LightningPathInput,
    ObjectIdLightningResult,
    StringLightningResult,
)
from fiftyone.server.scalars import BSON
from fiftyone.server.utils import meets_type
from fiftyone.server.view import get_view


_OBJECT_ID_HEX_LEN = 24


# Pymongo sort direction. The two legal values are pymongo.ASCENDING (1)
# and pymongo.DESCENDING (-1). We can't write Literal[ASCENDING, DESCENDING]
# directly because pymongo declares them as bare module-level ints (no
# Final), so they widen to `int` for type-checkers.
SortDirection = t.Literal[1, -1]


_INT_CLS = {
    fof.DateField: DateLightningResult,
    fof.DateTimeField: DateTimeLightningResult,
    fof.FrameNumberField: IntLightningResult,
    fof.IntField: IntLightningResult,
}


@dataclass
class DistinctQuery:
    path: str
    first: int
    has_list: bool
    is_object_id_field: bool
    exclude: t.Optional[t.List[str]] = None
    filters: t.Optional[BSON] = None
    index: t.Optional[str] = None
    max_documents_search: t.Optional[int] = None
    search: t.Optional[str] = None


def resolve_lightning_path_queries(
    path: LightningPathInput, dataset: fo.Dataset
) -> t.Tuple[
    AsyncIOMotorCollection,
    t.Union[DistinctQuery, t.List[t.Dict]],
    t.Callable,
    bool,
]:
    field_path = path.path
    field = dataset.get_field(field_path)
    field_path = f"{'.'.join(field_path.split('.')[:-1] + [field.db_field])}"
    collection = dataset._sample_collection_name
    is_frame_field = bool(dataset._is_frame_field(field_path))
    if is_frame_field:
        field_path = field_path[len(dataset._FRAMES_PREFIX) :]
        collection = dataset._frame_collection_name

    collection = foo.get_async_db_conn()[collection]

    while isinstance(field, fof.ListField):
        field = field.field

    if not isinstance(field, (fof.ObjectIdField, fof.StringField)) and (
        path.exclude or path.search
    ):
        raise ValueError(
            f"'exclude' and 'search' are not valid for "
            f"{field.__class__.__name__}"
        )

    if meets_type(field, fof.BooleanField):
        queries = [
            _match(field_path, False, limit=path.max_documents_search),
            _match(field_path, None, limit=path.max_documents_search),
            _match(field_path, True, limit=path.max_documents_search),
        ]

        def _resolve_bool(results):
            false, none, true = results
            return BooleanLightningResult(
                path=path.path,
                false=bool(false),
                none=bool(none),
                true=bool(true),
            )

        return collection, queries, _resolve_bool, is_frame_field

    if meets_type(field, (fof.DateField, fof.DateTimeField, fof.IntField)):
        queries = [
            _first(
                field_path,
                dataset,
                ASCENDING,
                is_frame_field,
                limit=path.max_documents_search,
            ),
            _first(
                field_path,
                dataset,
                DESCENDING,
                is_frame_field,
                limit=path.max_documents_search,
            ),
            _match(field_path, None, limit=path.max_documents_search),
        ]

        def _resolve_int(results):
            min_val, max_val, none = results
            return _INT_CLS[field.__class__](
                path=path.path,
                max=_parse_result(max_val),
                min=_parse_result(min_val),
                none=bool(none),
            )

        return collection, queries, _resolve_int, is_frame_field

    if meets_type(field, fof.FloatField):
        queries = [
            _first(
                field_path,
                dataset,
                ASCENDING,
                is_frame_field,
                limit=path.max_documents_search,
            ),
            _first(
                field_path,
                dataset,
                DESCENDING,
                is_frame_field,
                limit=path.max_documents_search,
            ),
        ] + [
            _match(field_path, v, limit=path.max_documents_search)
            for v in (float("-inf"), float("inf"), float("nan"), None)
        ]

        def _resolve_float(results):
            min_val, max_val, ninf, inf, nan, none = results

            inf = bool(inf)
            nan = bool(nan)
            ninf = bool(ninf)
            none = bool(none)

            return FloatLightningResult(
                inf=inf,
                path=path.path,
                max=_parse_result(max_val),
                min=_parse_result(min_val),
                nan=nan,
                ninf=ninf,
                none=none,
            )

        return collection, queries, _resolve_float, is_frame_field

    if meets_type(field, fof.ObjectIdField):

        def _resolve_object_id(results):
            return ObjectIdLightningResult(path=path.path, values=results[0])

        d = asdict(path)
        d["filters"] = path.filters
        d["has_list"] = _has_list(dataset, field_path, is_frame_field)
        d["is_object_id_field"] = True
        d["index"] = path.index
        d["max_documents_search"] = path.max_documents_search
        d["path"] = field_path
        return (
            collection,
            [DistinctQuery(**d)],
            _resolve_object_id,
            is_frame_field,
        )

    if meets_type(field, fof.StringField):

        def _resolve_string(results):
            return StringLightningResult(path=path.path, values=results[0])

        d = asdict(path)
        d["filters"] = path.filters
        d["has_list"] = _has_list(dataset, field_path, is_frame_field)
        d["is_object_id_field"] = False
        d["index"] = path.index
        d["max_documents_search"] = path.max_documents_search
        d["path"] = field_path
        return (
            collection,
            [DistinctQuery(**d)],
            _resolve_string,
            is_frame_field,
        )

    raise ValueError(f"cannot resolve {path.path}: {field} is not supported")


async def do_async_pooled_queries(
    dataset: fo.Dataset,
    queries: t.List[
        t.Tuple[
            AsyncIOMotorCollection,
            t.Union[DistinctQuery, t.List[t.Dict]],
            bool,
        ]
    ],
    match_filter: t.Optional[t.Mapping[str, str]],
):
    return await asyncio.gather(
        *[
            _do_async_query(
                dataset,
                collection,
                query,
                None if is_frames else match_filter,
                is_frames,
            )
            for collection, query, is_frames in queries
        ]
    )


async def _do_async_query(
    dataset: fo.Dataset,
    collection: AsyncIOMotorCollection,
    query: t.Union[DistinctQuery, t.List[t.Dict]],
    match_filter: t.Optional[t.Mapping[str, str]],
    is_frames: bool,
):
    if isinstance(query, DistinctQuery):
        return await _do_distinct_queries(
            dataset, collection, query, match_filter, is_frames
        )

    if match_filter:
        query = [{"$match": match_filter}] + query

    return [i async for i in collection.aggregate(query)]


async def _do_distinct_queries(
    dataset: fo.Dataset,
    collection: AsyncIOMotorCollection,
    query: t.Union[DistinctQuery, t.List[t.Dict]],
    match_filter: t.Optional[t.Mapping[str, str]],
    is_frames: bool,
):
    if query.filters or not query.index:
        return await _do_distinct_lazy_pipeline(
            dataset, collection, query, match_filter, is_frames
        )

    if query.has_list:
        return await _do_list_distinct_query(collection, query)

    return await _do_distinct_grouped_pipeline(
        dataset, collection, query, match_filter, is_frames
    )


async def _do_list_distinct_query(
    collection: AsyncIOMotorCollection,
    query: t.Union[DistinctQuery, t.List[t.Dict]],
):
    match = None
    matcher = lambda v: False
    if query.search:
        match = query.search
        matcher = lambda v: not v.startswith(match)
        if query.is_object_id_field:
            match = match[:_OBJECT_ID_HEX_LEN]
            matcher = lambda v: v < match

    try:
        result = await collection.distinct(query.path)
    except OperationFailure:
        # too many results (e.g. 16MB BSON cap exceeded)
        return None

    values = []
    exclude = set(query.exclude or [])

    for value in result:
        if query.is_object_id_field:
            value = str(value)

        if value in exclude:
            continue

        if not value or matcher(value):
            continue

        values.append(value)
        if len(values) == query.first:
            break

    return values


async def _do_distinct_lazy_pipeline(
    dataset: fo.Dataset,
    collection: AsyncIOMotorCollection,
    query: DistinctQuery,
    match_filter: t.Optional[t.Mapping[str, str]],
    is_frames: bool,
):
    pipeline = []
    if match_filter:
        pipeline.append({"$match": match_filter})

    if query.filters and not is_frames:
        pipeline += get_view(dataset, filters=query.filters)._pipeline()

    pipeline.append(
        {"$project": {"_id": f"${query.path}"}},
    )

    return await _handle_pipeline(
        pipeline, dataset, collection, query, is_frames
    )


async def _do_distinct_grouped_pipeline(
    dataset: fo.Dataset,
    collection: AsyncIOMotorCollection,
    query: DistinctQuery,
    match_filter: t.Optional[t.Mapping[str, str]],
    is_frames: bool,
):
    pipeline = []
    if match_filter:
        pipeline += [{"$match": match_filter}]

    pipeline += [
        {"$sort": {query.path: ASCENDING}},
        {"$group": {"_id": f"${query.path}"}},
    ]

    return await _handle_pipeline(
        pipeline, dataset, collection, query, is_frames, disable_limit=True
    )


def _add_search(query: DistinctQuery):
    # strip chars after 24
    if query.is_object_id_field:
        search = query.search[:_OBJECT_ID_HEX_LEN]
        add = (_OBJECT_ID_HEX_LEN - len(search)) * "0"
        if add:
            search = f"{search}{add}"
        try:
            value = {"$gte": ObjectId(search)}
        except InvalidId:
            # search is not valid
            value = {"$lt": ObjectId("0" * _OBJECT_ID_HEX_LEN)}
    else:
        value = {"$regex": f"^{re.escape(query.search)}"}
    return {"$match": {"_id": value}}


def _first(
    path: str,
    dataset: fo.Dataset,
    sort: SortDirection,
    is_frame_field: bool,
    limit=None,
):
    pipeline = []
    if limit:
        pipeline.append({"$limit": limit})

    pipeline += [
        {"$sort": {path: sort}},
    ]

    full_path = f"frames.{path}" if is_frame_field else path
    matched_arrays = _match_arrays(dataset, full_path, is_frame_field)
    if matched_arrays:
        list_of_lists = _is_list_of_lists(dataset, path, is_frame_field)
        if list_of_lists:
            pipeline.append(
                {
                    "$project": {
                        "_id": {
                            "$reduce": {
                                "input": f"${path}",
                                "initialValue": [],
                                "in": {"$concatArrays": ["$$value", "$$this"]},
                            }
                        }
                    }
                }
            )

        pipeline.append(
            {
                "$project": {
                    "_id": {
                        "$reduce": {
                            "input": "$_id" if list_of_lists else f"${path}",
                            "initialValue": None,
                            "in": {
                                "$min"
                                if sort == ASCENDING
                                else "$max": [
                                    "$$value",
                                    "$$this",
                                ]
                            },
                        }
                    }
                }
            }
        )
        return (
            pipeline
            + [{"$limit": 1}]
            + _filter_result(dataset, full_path, sort)
        )

    pipeline.append({"$project": {"_id": f"${path}"}})

    return (
        pipeline + _filter_result(dataset, full_path, sort) + [{"$limit": 1}]
    )


def _filter_result(
    dataset: fo.Dataset,
    path: str,
    sort: SortDirection,
):
    field = dataset.get_field(path)
    while isinstance(field, fo.ListField):
        field = field.field

    if isinstance(field, (fo.DateField, fo.DateTimeField)):
        return [{"$match": {"_id": {"$ne": None}}}]

    return _handle_nonfinites(sort)


def _handle_nonfinites(sort: SortDirection):
    return [
        {
            "$match": {
                "_id": (
                    {"$gt": float("-inf")}
                    if sort == ASCENDING
                    else {"$lt": float("inf")}
                )
            }
        }
    ]


async def _handle_pipeline(
    pipeline: t.List[t.Dict],
    dataset: fo.Dataset,
    collection: AsyncIOMotorCollection,
    query: DistinctQuery,
    is_frames: bool,
    disable_limit: bool = False,
):
    match_search = None

    if not disable_limit and query.max_documents_search:
        pipeline.append({"$limit": query.max_documents_search})

    match_arrays = _match_arrays(dataset, query.path, is_frames) + _unwind(
        dataset, query.path, is_frames
    )

    if query.search:
        match_search = _add_search(query)
        if len(match_arrays) <= 2:
            pipeline.append(match_search)

    if match_arrays:
        pipeline += match_arrays
        if match_search:
            # match again after unwinding list fields
            pipeline.append(match_search)

    values = set()
    exclude = set(query.exclude or [])
    kwargs = {"hint": query.index} if query.index else {}

    async for value in collection.aggregate(pipeline, **kwargs):
        value = value.get("_id", None)
        if value is None:
            continue
        if query.is_object_id_field:
            value = str(value)
        if value in exclude:
            continue

        values.add(value)

        if len(values) == query.first:
            break

    return list(sorted(values))


def _has_list(dataset: fo.Dataset, path: str, is_frame_field: bool):
    keys = path.split(".")
    path = None

    if is_frame_field:
        path = "frames"

    for key in keys:
        path = ".".join([path, key]) if path else key
        field = dataset.get_field(path)
        if isinstance(field, fof.ListField):
            return True

    return False


def _match(path: str, value: t.Union[str, float, int, bool], limit=None):
    pipeline = []
    if limit:
        pipeline.append(
            {"$limit": limit},
        )

    return pipeline + [
        {"$match": {path: value}},
        {"$project": {"_id": True}},
        {"$limit": 1},
    ]


def _match_arrays(dataset: fo.Dataset, path: str, is_frame_field: bool):
    keys = path.split(".")
    path = None

    if is_frame_field:
        path = keys[0]
        keys = keys[1:]

    for key in keys:
        path = ".".join([path, key]) if path else key
        field = dataset.get_field(path)
        if isinstance(field, fof.ListField):
            # only once for label list fields, e.g. Detections
            return [{"$match": {"_id.0": {"$exists": True}}}]

    return []


def _is_list_of_lists(dataset: fo.Dataset, path: str, is_frame_field: bool):
    keys = path.split(".")
    path = None

    if is_frame_field:
        path = keys[0]
        keys = keys[1:]

    is_list = False
    for key in keys:
        path = ".".join([path, key]) if path else key
        field = dataset.get_field(path)
        if isinstance(field, fof.ListField):
            if is_list:
                return True

            is_list = True

    return False


def _parse_result(data):
    if data and data[0]:
        value = data[0]

        return value.get("_id", None)

    return None


def _unwind(dataset: fo.Dataset, path: str, is_frame_field: bool):
    keys = path.split(".")
    path = None
    pipeline = []

    prefix = ""
    if is_frame_field:
        prefix = "frames."

    for key in keys:
        path = ".".join([path, key]) if path else key
        field = dataset.get_field(f"{prefix}{path}")
        while isinstance(field, fof.ListField):
            pipeline.append({"$unwind": "$_id"})
            field = field.field

    return pipeline
