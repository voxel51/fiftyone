"""
FiftyOne Server lightning queries

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
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
from fiftyone.server.utils import meets_type


@gql.input
class LightningPathInput:
    path: str

    exclude: t.Optional[t.List[str]] = gql.field(
        description="exclude these values from results", default=None
    )
    first: t.Optional[int] = foc.LIST_LIMIT
    search: t.Optional[str] = None


@gql.input
class LightningInput:
    dataset: str
    paths: t.List[LightningPathInput]


@gql.interface
class LightningResult:
    path: str


@gql.type
class BooleanLightningResult(LightningResult):
    false: bool
    true: bool


@gql.type
class DateLightningResult(LightningResult):
    max: t.Optional[date]
    min: t.Optional[date]


@gql.type
class DateTimeLightningResult(LightningResult):
    max: t.Optional[datetime]
    min: t.Optional[datetime]


@gql.type
class FloatLightningResult(LightningResult):
    inf: bool
    max: t.Optional[float]
    min: t.Optional[float]
    nan: bool
    ninf: bool


@gql.type
class IntLightningResult(LightningResult):
    max: t.Optional[float]
    min: t.Optional[float]


@gql.type
class StringLightningResult(LightningResult):
    values: t.Optional[t.List[t.Optional[str]]] = None


LIGHTNING_QUERIES = (
    BooleanLightningResult,
    FloatLightningResult,
    IntLightningResult,
)

INT_CLS = {
    fof.DateField: DateLightningResult,
    fof.DateTimeField: DateTimeLightningResult,
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
        StringLightningResult,
    ),
)


async def lightning_resolver(
    input: LightningInput, info: Info
) -> t.List[LightningResults]:
    dataset: fo.Dataset = fo.load_dataset(input.dataset)
    collections, queries, resolvers = zip(
        *[
            _resolve_lightning_path_queries(path, dataset, info)
            for path in input.paths
        ]
    )
    counts = [len(a) for a in queries]
    flattened = [
        (collection, item)
        for collection, sublist in zip(collections, queries)
        for item in sublist
    ]
    result = await _do_async_pooled_queries(flattened)

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
    exclude: t.Optional[t.List[str]] = None
    search: t.Optional[str] = None


def _resolve_lightning_path_queries(
    path: LightningPathInput, dataset: fo.Dataset, info: Info
) -> t.Tuple[
    AsyncIOMotorCollection,
    t.Union[DistinctQuery, t.List[t.Dict]],
    t.Callable,
]:
    field_path = path.path
    field = dataset.get_field(field_path)
    collection = dataset._sample_collection_name
    is_frame_field = bool(dataset._is_frame_field(field_path))
    if is_frame_field:
        field_path = field_path[len(dataset._FRAMES_PREFIX) :]
        collection = dataset._frame_collection_name

    collection = info.context.db[collection]

    while isinstance(field, fof.ListField):
        field = field.field

    if not isinstance(field, fof.StringField) and (
        path.exclude or path.search
    ):
        raise ValueError(
            "'excluded' and 'search' are not valid for f{fof.StringField}"
        )

    if meets_type(field, fof.BooleanField):
        queries = [
            _match(field_path, False),
            _match(field_path, True),
        ]

        def _resolve_bool(results):
            false, true = results
            return BooleanLightningResult(
                path=path.path, false=bool(false), true=bool(true)
            )

        return collection, queries, _resolve_bool

    if meets_type(field, (fof.DateField, fof.DateTimeField, fof.IntField)):
        queries = [
            _first(field_path, dataset, 1, is_frame_field),
            _first(field_path, dataset, -1, is_frame_field),
        ]

        def _resolve_int(results):
            min, max = results
            return INT_CLS[field.__class__](
                path=path.path,
                max=_parse_result(max),
                min=_parse_result(min),
            )

        return collection, queries, _resolve_int

    if meets_type(field, fof.FloatField):
        queries = [
            _first(field_path, dataset, 1, is_frame_field),
            _first(field_path, dataset, -1, is_frame_field),
        ] + [
            _match(field_path, v)
            for v in (float("-inf"), float("inf"), float("nan"))
        ]

        def _resolve_float(results):
            min, max, ninf, inf, nan = results

            inf = bool(inf)
            nan = bool(nan)
            ninf = bool(ninf)

            has_bounds = not inf and not ninf

            return FloatLightningResult(
                path=path.path,
                max=_parse_result(max, has_bounds),
                min=_parse_result(min, has_bounds),
                ninf=ninf,
                inf=inf,
                nan=nan,
            )

        return collection, queries, _resolve_float

    if meets_type(field, fof.StringField):

        def _resolve_string(results):
            return StringLightningResult(path=path.path, values=results[0])

        d = asdict(path)
        d["path"] = field_path
        d["has_list"] = _has_list(dataset, field_path, is_frame_field)
        return (
            collection,
            [DistinctQuery(**d)],
            _resolve_string,
        )

    raise ValueError(f"cannot resolve {path.path}: {field} is not supported")


async def _do_async_pooled_queries(
    queries: t.List[
        t.Tuple[AsyncIOMotorCollection, t.Union[DistinctQuery, t.List[t.Dict]]]
    ]
):
    return await asyncio.gather(
        *[_do_async_query(collection, query) for collection, query in queries]
    )


async def _do_async_query(
    collection: AsyncIOMotorCollection,
    query: t.Union[DistinctQuery, t.List[t.Dict]],
):
    if isinstance(query, DistinctQuery):
        if query.has_list:
            return await _do_distinct_query(collection, query)

        return await _do_distinct_pipeline(collection, query)

    return [i async for i in collection.aggregate(query)]


async def _do_distinct_query(
    collection: AsyncIOMotorCollection, query: DistinctQuery
):
    match = None
    if query.search:
        match = query.search

    try:
        result = await collection.distinct(query.path)
    except:
        # too many results
        return None

    values = []
    exclude = set(query.exclude or [])

    for value in result:
        if value in exclude:
            continue

        if not value or (match and match not in value):
            continue

        values.append(value)
        if len(values) == query.first:
            break

    return values


async def _do_distinct_pipeline(
    collection: AsyncIOMotorCollection, query: DistinctQuery
):
    pipeline = [{"$sort": {query.path: 1}}]
    if query.search:
        pipeline.append({"$match": {query.path: Regex(f"^{query.search}")}})

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


def _first(
    path: str,
    dataset: fo.Dataset,
    sort: t.Union[t.Literal[-1], t.Literal[1]],
    is_frame_field: bool,
):
    pipeline = [{"$sort": {path: sort}}]

    if sort:
        pipeline.append({"$match": {path: {"$ne": None}}})

    pipeline.append({"$limit": 1})

    unwound = _unwind(dataset, path, is_frame_field)

    if unwound:
        pipeline += unwound
        if sort:
            pipeline.append({"$match": {path: {"$ne": None}}})

    return pipeline + [
        {"$group": {"_id": {"$min" if sort == 1 else "$max": f"${path}"}}}
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


def _parse_result(data, check=True):
    if check and data and data[0]:
        value = data[0].get("_id", None)
        if not isinstance(value, float) or not math.isnan(value):
            return value

    return None


def _unwind(dataset: fo.Dataset, path: str, is_frame_field: bool):
    keys = path.split(".")
    path = None
    pipeline = []

    if is_frame_field:
        path = keys[0]
        keys = keys[1:]

    for key in keys:
        path = ".".join([path, key]) if path else key
        field = dataset.get_field(path)
        while isinstance(field, fof.ListField):
            pipeline.append({"$unwind": f"${path}"})
            field = field.field

    return pipeline
