"""
FiftyOne Server lightning queries

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from bson import ObjectId
from dataclasses import asdict, dataclass
from datetime import date, datetime
import math
import typing as t

import asyncio
from bson.regex import Regex
from motor.motor_asyncio import AsyncIOMotorCollection
import strawberry as gql

import fiftyone as fo
import fiftyone.core.fields as fof

import fiftyone.server.constants as foc
from fiftyone.server.data import Info
from fiftyone.server.scalars import BSON
from fiftyone.server.utils import meets_type
from fiftyone.server.view import get_view


_TWENTY_FOUR = 24


@gql.input
class LightningPathInput:
    path: str

    exclude: t.Optional[t.List[str]] = gql.field(
        description="exclude these values from results", default=None
    )
    first: t.Optional[int] = foc.LIST_LIMIT
    search: t.Optional[str] = None
    filters: t.Optional[BSON] = None


@gql.input
class LightningInput:
    dataset: str
    paths: t.List[LightningPathInput]
    slice: t.Optional[str] = None


@gql.interface
class LightningResult:
    path: str


@gql.type
class BooleanLightningResult(LightningResult):
    false: bool
    none: bool
    true: bool


@gql.type
class DateLightningResult(LightningResult):
    max: t.Optional[date]
    min: t.Optional[date]
    none: bool


@gql.type
class DateTimeLightningResult(LightningResult):
    max: t.Optional[datetime]
    min: t.Optional[datetime]
    none: bool


@gql.type
class FloatLightningResult(LightningResult):
    inf: bool
    max: t.Optional[float]
    min: t.Optional[float]
    nan: bool
    ninf: bool
    none: bool


@gql.type
class IntLightningResult(LightningResult):
    max: t.Optional[float]
    min: t.Optional[float]
    none: bool


@gql.type
class ObjectIdLightningResult(LightningResult):
    values: t.Optional[t.List[t.Optional[str]]] = None


@gql.type
class StringLightningResult(LightningResult):
    values: t.Optional[t.List[t.Optional[str]]] = None


INT_CLS = {
    fof.DateField: DateLightningResult,
    fof.DateTimeField: DateTimeLightningResult,
    fof.FrameNumberField: IntLightningResult,
    fof.IntField: IntLightningResult,
}

LightningResults = gql.union(
    "LightningResults",
    (
        BooleanLightningResult,
        DateLightningResult,
        DateTimeLightningResult,
        FloatLightningResult,
        IntLightningResult,
        ObjectIdLightningResult,
        StringLightningResult,
    ),
)


async def lightning_resolver(
    input: LightningInput, info: Info
) -> t.List[LightningResults]:
    dataset: fo.Dataset = fo.load_dataset(input.dataset)
    collections, queries, resolvers, is_frames = zip(
        *[
            _resolve_lightning_path_queries(path, dataset, info)
            for path in input.paths
        ]
    )
    counts = [len(a) for a in queries]
    flattened = [
        (collection, item, is_frames)
        for collection, sublist, is_frames in zip(
            collections, queries, is_frames
        )
        for item in sublist
    ]

    if dataset.group_field and input.slice:
        filter = {f"{dataset.group_field}.name": input.slice}
        dataset.group_slice = input.slice
    else:
        filter = {}
    result = await _do_async_pooled_queries(dataset, flattened, filter)

    results = []
    offset = 0
    for length, resolve in zip(counts, resolvers):
        results.append(resolve(result[offset : length + offset]))
        offset += length

    return results


@dataclass
class DistinctQuery:
    path: str
    first: int
    has_list: bool
    is_object_id_field: bool
    exclude: t.Optional[t.List[str]] = None
    search: t.Optional[str] = None
    filters: t.Optional[BSON] = None


def _resolve_lightning_path_queries(
    path: LightningPathInput, dataset: fo.Dataset, info: Info
) -> t.Tuple[
    AsyncIOMotorCollection,
    t.Union[DistinctQuery, t.List[t.Dict]],
    t.Callable,
]:
    field_path = path.path
    field = dataset.get_field(field_path)
    field_path = f"{'.'.join(field_path.split('.')[:-1] + [field.db_field])}"
    collection = dataset._sample_collection_name
    is_frame_field = bool(dataset._is_frame_field(field_path))
    if is_frame_field:
        field_path = field_path[len(dataset._FRAMES_PREFIX) :]
        collection = dataset._frame_collection_name

    collection = info.context.db[collection]

    while isinstance(field, fof.ListField):
        field = field.field

    if not isinstance(field, (fof.ObjectIdField, fof.StringField)) and (
        path.exclude or path.search
    ):
        raise ValueError(
            f"'excluded' and 'search' are not valid for {fof.StringField}"
        )

    if meets_type(field, fof.BooleanField):
        queries = [
            _match(field_path, False),
            _match(field_path, None),
            _match(field_path, True),
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
            _first(field_path, dataset, 1, is_frame_field),
            _first(field_path, dataset, -1, is_frame_field),
            _match(field_path, None),
        ]

        def _resolve_int(results):
            min, max, none = results
            return INT_CLS[field.__class__](
                path=path.path,
                max=_parse_result(max),
                min=_parse_result(min),
                none=bool(none),
            )

        return collection, queries, _resolve_int, is_frame_field

    if meets_type(field, fof.FloatField):
        queries = [
            _first(field_path, dataset, 1, is_frame_field, floats=True),
            _first(field_path, dataset, -1, is_frame_field, floats=True),
        ] + [
            _match(field_path, v)
            for v in (float("-inf"), float("inf"), float("nan"), None)
        ]

        def _resolve_float(results):
            min, max, ninf, inf, nan, none = results

            inf = bool(inf)
            nan = bool(nan)
            ninf = bool(ninf)
            none = bool(none)

            return FloatLightningResult(
                inf=inf,
                path=path.path,
                max=_parse_result(max),
                min=_parse_result(min),
                nan=nan,
                ninf=ninf,
                none=none,
            )

        return collection, queries, _resolve_float, is_frame_field

    if meets_type(field, fof.ObjectIdField):

        def _resolve_object_id(results):
            return ObjectIdLightningResult(path=path.path, values=results[0])

        d = asdict(path)
        d["has_list"] = _has_list(dataset, field_path, is_frame_field)
        d["is_object_id_field"] = True
        d["path"] = field_path
        d["filters"] = path.filters
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
        d["has_list"] = _has_list(dataset, field_path, is_frame_field)
        d["is_object_id_field"] = False
        d["path"] = field_path
        d["filters"] = path.filters
        return (
            collection,
            [DistinctQuery(**d)],
            _resolve_string,
            is_frame_field,
        )

    raise ValueError(f"cannot resolve {path.path}: {field} is not supported")


async def _do_async_pooled_queries(
    dataset: fo.Dataset,
    queries: t.List[
        t.Tuple[
            AsyncIOMotorCollection,
            t.Union[DistinctQuery, t.List[t.Dict]],
            bool,
        ]
    ],
    filter: t.Optional[t.Mapping[str, str]],
):
    return await asyncio.gather(
        *[
            _do_async_query(
                dataset, collection, query, None if is_frames else filter
            )
            for collection, query, is_frames in queries
        ]
    )


async def _do_async_query(
    dataset: fo.Dataset,
    collection: AsyncIOMotorCollection,
    query: t.Union[DistinctQuery, t.List[t.Dict]],
    filter: t.Optional[t.Mapping[str, str]],
):
    if isinstance(query, DistinctQuery):
        if query.has_list:
            return await _do_distinct_query(collection, query)

        return await _do_distinct_pipeline(dataset, collection, query, filter)

    if filter:
        for k, v in filter.items():
            query.insert(0, {"$match": {k: v}})
            query.insert(0, {"$sort": {k: 1}})

    return [i async for i in collection.aggregate(query)]


async def _do_distinct_query(
    collection: AsyncIOMotorCollection,
    query: DistinctQuery,
):
    match = None
    matcher = lambda v: False
    if query.search:
        match = query.search
        matcher = lambda v: match not in v
        if query.is_object_id_field:
            match = match[:_TWENTY_FOUR]
            matcher = lambda v: v < match

    try:
        result = await collection.distinct(query.path)
    except:
        # too many results
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


async def _do_distinct_pipeline(
    dataset: fo.Dataset,
    collection: AsyncIOMotorCollection,
    query: DistinctQuery,
    filter: t.Optional[t.Mapping[str, str]],
):
    pipeline = []
    if filter:
        pipeline.append({"$match": filter})

    if query.filters:
        pipeline += get_view(dataset, filters=query.filters)._pipeline()

    pipeline.append({"$sort": {query.path: 1}})

    match_search = None
    if query.search:
        match_search = _add_search(query)
        pipeline.append(match_search)

    match_arrays = _match_arrays(dataset, query.path, False) + _unwind(
        dataset, query.path, False
    )
    if match_arrays:
        pipeline += match_arrays
        if match_search:
            # match again after unwinding list fields
            pipeline.append(match_search)

    pipeline += [{"$group": {"_id": f"${query.path}"}}]

    values = []
    exclude = set(query.exclude or [])
    async for value in collection.aggregate(pipeline):
        value = value["_id"]
        if value is None or value in exclude:
            continue

        values.append(value)

        if len(values) == query.first:
            break

    return values


def _add_search(query: DistinctQuery):
    # strip chars after 24
    if query.is_object_id_field:
        search = query.search[:_TWENTY_FOUR]
        add = (_TWENTY_FOUR - len(search)) * "0"
        if add:
            search = f"{search}{add}"
        try:
            value = {"$gte": ObjectId(search)}
        except:
            # search is not valid
            value = {"$lt": ObjectId("0" * _TWENTY_FOUR)}
    else:
        value = Regex(f"^{query.search}")
    return {"$match": {query.path: value}}


def _first(
    path: str,
    dataset: fo.Dataset,
    sort: t.Union[t.Literal[-1], t.Literal[1]],
    is_frame_field: bool,
    floats=False,
):
    pipeline = [{"$sort": {path: sort}}]

    matched_arrays = _match_arrays(dataset, path, is_frame_field)
    if matched_arrays:
        pipeline += matched_arrays
    elif floats:
        pipeline.extend(_handle_nonfinites(path, sort))

    pipeline.extend([{"$match": {path: {"$exists": True}}}, {"$limit": 1}])
    unwound = _unwind(dataset, path, is_frame_field)
    if unwound:
        pipeline += unwound
        if floats:
            pipeline.extend(_handle_nonfinites(path, sort))

    return pipeline + [
        {
            "$group": {
                "_id": None,
                "value": {"$min" if sort == 1 else "$max": f"${path}"},
            }
        }
    ]


def _handle_nonfinites(path: str, sort: t.Union[t.Literal[-1], t.Literal[1]]):
    return [
        {
            "$match": {
                path: (
                    {"$gt": float("-inf")}
                    if sort == 1
                    else {"$lt": float("inf")}
                )
            }
        }
    ]


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


def _match(path: str, value: t.Union[str, float, int, bool]):
    return [
        {"$match": {path: value}},
        {"$project": {"_id": True}},
        {"$limit": 1},
    ]


def _match_arrays(dataset: fo.Dataset, path: str, is_frame_field: bool):
    keys = path.split(".")
    path = None
    pipeline = []

    if is_frame_field:
        path = keys[0]
        keys = keys[1:]

    for key in keys:
        path = ".".join([path, key]) if path else key
        field = dataset.get_field(path)
        if isinstance(field, fof.ListField):
            # only once for label list fields, e.g. Detections
            return [{"$match": {f"{path}.0": {"$exists": True}}}]

    return pipeline


def _parse_result(data):
    if data and data[0]:
        value = data[0]
        if "value" in value:
            value = value["value"]
            return (
                value
                if not isinstance(value, float) or math.isfinite(value)
                else None
            )

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
            pipeline.append({"$unwind": f"${path}"})
            field = field.field

    return pipeline
