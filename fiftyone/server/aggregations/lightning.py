"""
FiftyOne Server lightning aggregations

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import typing as t

import strawberry as gql

import fiftyone.core.collections as foc
import fiftyone.core.odm.database as foo
import fiftyone.core.fields as fof
from fiftyone.server.utils import meets_type


@gql.interface
class LightningAggregation:
    path: str


@gql.type
class BooleanLightningAggregation(LightningAggregation):
    false: bool
    true: bool


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


LIGHTNING_AGGREGATIONS = (
    BooleanLightningAggregation,
    FloatLightningAggregation,
    IntLightningAggregation,
)


async def lightning_aggregate_resolver(
    path: str, view: foc.SampleCollection
) -> t.List[
    t.Union[
        BooleanLightningAggregation,
        FloatLightningAggregation,
        IntLightningAggregation,
    ]
]:
    pipelines, resolve = _resolve_lightning_path_aggregation(path, view)
    collection = foo.get_async_db_conn()[view._dataset._sample_collection_name]

    results = await foo.aggregate(collection, pipelines)


def _resolve_lightning_path_aggregation(path: str, view: foc.SampleCollection):
    field = view.get_field(path)

    while isinstance(field, fof.ListField):
        field = field.field

    if meets_type(field, fof.BooleanField):
        pipelines = [
            [{"$match": {path: v}}, {"$limit": 1}] for v in (False, True)
        ]

        def resolve_bool(results):
            false, true = results
            return BooleanLightningAggregation(
                path, false=bool(false), true=bool(true)
            )

        return pipelines, resolve_bool

    if meets_type(field, (fof.DateField, fof.DateTimeField, fof.IntField)):
        pipelines = [
            [{"$sort": {path: 1}}, {"$limit": 1}],
            [{"$sort": {path: -1}}, {"$limit": 1}],
        ]

        def resolve_int(results):
            min, max = results
            return IntLightningAggregation(path, min=min, max=max)

        return pipelines, resolve_int

    if meets_type(field, fof.FloatField):
        pipelines = [
            [{"$sort": {path: 1}}, {"$limit": 1}],
            [{"$sort": {path: -1}}, {"$limit": 1}],
        ] + [
            [{"$match": {path: v}}, {"$limit": 1}]
            for v in (float("-inf"), float("inf"), float("nan"))
        ]

        def resolve_float(results):
            min, max, ninf, inf, nan = results
            return FloatLightningAggregation(
                path, min=min, max=max, ninf=ninf, inf=inf, nan=nan
            )

        return pipelines, resolve_float
