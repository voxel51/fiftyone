"""
FiftyOne Server lightning aggregations

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from dataclasses import asdict, dataclass
from datetime import date, datetime
import re
import typing as t

import asyncio
from bson.regex import Regex
from motor.motor_asyncio import AsyncIOMotorCollection
import strawberry as gql

import fiftyone as fo
import fiftyone.core.odm as foo
import fiftyone.core.fields as fof
from fiftyone.server.utils import meets_type


@gql.input
class LightningPathInput:
    path: str

    exclude: t.Optional[t.List[str]] = None
    first: t.Optional[int] = None
    search: t.Optional[str] = None


@gql.input
class LightningInput:
    dataset: str
    paths: t.List[LightningPathInput]


@gql.interface
class LightningAggregation:
    path: str


@gql.type
class BooleanLightningAggregation(LightningAggregation):
    false: bool
    true: bool


@gql.type
class DateLightningAggregation(LightningAggregation):
    max: t.Optional[date]
    min: t.Optional[date]


@gql.type
class DateTimeLightningAggregation(LightningAggregation):
    max: t.Optional[datetime]
    min: t.Optional[datetime]


@gql.type
class FloatLightningAggregation(LightningAggregation):
    inf: bool
    max: t.Optional[float]
    min: t.Optional[float]
    nan: bool
    ninf: bool


@gql.type
class IntLightningAggregation(LightningAggregation):
    max: t.Optional[float]
    min: t.Optional[float]


@gql.type
class StringLightningAggregation(LightningAggregation):
    values: t.List[str]


LIGHTNING_AGGREGATIONS = (
    BooleanLightningAggregation,
    FloatLightningAggregation,
    IntLightningAggregation,
)

INT_CLS = {
    fof.DateField: DateLightningAggregation,
    fof.DateTimeField: DateTimeLightningAggregation,
    fof.IntField: IntLightningAggregation,
}


async def lightning_resolver(
    input: LightningInput,
) -> t.List[
    t.Union[
        BooleanLightningAggregation,
        DateLightningAggregation,
        DateTimeLightningAggregation,
        FloatLightningAggregation,
        IntLightningAggregation,
        StringLightningAggregation,
    ]
]:
    dataset: fo.Dataset = fo.load_dataset(input.dataset)
    collections, queries, resolvers = zip(
        *[
            _resolve_lightning_path_queries(path, dataset)
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

    only: t.Optional[bool] = False
    exclude: t.Optional[t.List[str]] = None
    search: t.Optional[str] = None


def _resolve_lightning_path_queries(
    path: LightningPathInput, dataset: fo.Dataset
) -> t.Tuple[
    AsyncIOMotorCollection,
    t.Union[DistinctQuery, t.List[t.Dict]],
    t.Callable,
]:
    field = dataset.get_field(path.path)
    field_path = path.path
    collection = dataset._sample_collection_name
    is_frame_field = bool(dataset._is_frame_field(path.path))
    if is_frame_field:
        field_path = field_path[len(dataset._FRAMES_PREFIX) :]
        collection = dataset._frame_collection_name

    collection = foo.get_async_db_conn()[collection]

    while isinstance(field, fof.ListField):
        field = field.field

    if not isinstance(field, fof.StringField) and (
        path.exclude or path.search
    ):
        raise ValueError("unexpected")

    if meets_type(field, fof.BooleanField):
        queries = [
            _match(field_path, False),
            _match(field_path, True),
        ]

        def _resolve_bool(results):
            false, true = results
            return BooleanLightningAggregation(
                path=path.path, false=bool(false), true=bool(true)
            )

        return collection, queries, _resolve_bool

    if meets_type(field, (fof.DateField, fof.DateTimeField, fof.IntField)):
        queries = [
            _first(field_path, dataset, 1, is_frame_field),
            _first(field_path, dataset, -1, is_frame_field),
        ]
        key = field_path.split(".")[-1]

        def _resolve_int(results):
            min, max = results
            return INT_CLS[field.__class__](
                path=path.path,
                max=_parse_result(max, key),
                min=_parse_result(min, key),
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
            key = field_path.split(".")[-1]

            inf = bool(inf)
            nan = bool(nan)
            ninf = bool(ninf)

            return FloatLightningAggregation(
                path=path.path,
                max=_parse_result(max, key, not inf and not nan),
                min=_parse_result(min, key, not ninf and not nan),
                ninf=ninf,
                inf=inf,
                nan=nan,
            )

        return collection, queries, _resolve_float

    if meets_type(field, fof.StringField):

        def _resolve_string(results):
            return StringLightningAggregation(
                path=path.path, values=results[0]
            )

        d = asdict(path)
        d["path"] = field_path
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
        search = None
        match = None
        if query.search:
            match = (
                re.escape(query.search)
                .replace(r"\*", ".*")
                .replace(r"\?", ".")
            )
            search = {query.path: {"$regex": Regex(match)}}

        result = await collection.distinct(query.path, filter=search)
        values = []
        exclude = set(query.exclude or [])

        for value in result:
            if value in exclude:
                continue

            if match and match not in value:
                continue

            values.append(value)
            if len(values) == query.first:
                break

        return values
    else:
        result = collection.aggregate(query)

    try:
        return [i async for i in result]
    except:
        return None


def _first(
    path: str,
    dataset: fo.Dataset,
    sort: t.Union[t.Literal[-1], t.Literal[1]],
    is_frame_field: bool,
):
    pipeline = [
        {"$project": {path: 1}},
        {"$sort": {path: sort}},
    ]
    unwound = _unwind(path, dataset, is_frame_field)
    if unwound:
        pipeline += unwound + [{"$sort": {path: sort}}]

    pipeline.append({"$limit": 1})

    parent = path.split(".")[:-1]
    if parent:
        new_root = ".".join(parent)
        pipeline.append({"$replaceRoot": {"newRoot": f"${new_root}"}})

    return pipeline


def _match(path: str, value: t.Union[str, float, int, bool]):
    return [
        {"$match": {path: value}},
        {"$project": {"_id": True}},
        {"$limit": 1},
    ]


def _parse_result(data, key, check=True, is_not=None):
    if check and data and data[0]:
        return data[0].get(key, None)

    return None


def _unwind(path: str, dataset: fo.Dataset, is_frame_field: bool):
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
