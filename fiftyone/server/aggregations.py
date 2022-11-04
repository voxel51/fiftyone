"""
FiftyOne Server aggregations

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from datetime import date, datetime, timedelta
import typing as t

import asyncio
import eta.core.utils as etau
import strawberry as gql

import fiftyone as fo
import fiftyone.core.aggregations as foa
import fiftyone.core.collections as foc

from fiftyone.server.constants import LIST_LIMIT
from fiftyone.server.data import T
from fiftyone.server.scalars import BSONArray


_DEFAULT_NUM_HISTOGRAM_BINS = 25


@gql.type
class ValueCount(t.Generic[T]):
    count: int
    value: t.Union[T, None]


@gql.type
class BoolCountValuesResponse:
    values: t.List[ValueCount[bool]]


@gql.type
class IntCountValuesResponse:
    values: t.List[ValueCount[int]]


@gql.type
class StrCountValuesResponse:
    values: t.List[ValueCount[str]]


CountValuesResponses = gql.union(
    "CountValuesResponses",
    (BoolCountValuesResponse, IntCountValuesResponse, StrCountValuesResponse),
)
COUNT_VALUES_TYPES = {fo.BooleanField, fo.IntField, fo.StringField}


@gql.type
class HistogramValue(t.Generic[T]):
    count: int
    min: T
    max: T


@gql.type
class DatetimeHistogramValuesResponse:
    values: t.List[HistogramValue[datetime]]


@gql.type
class FloatHistogramValuesResponse:
    values: t.List[HistogramValue[float]]


@gql.type
class IntHistogramValuesResponse:
    values: t.List[HistogramValue[int]]


@gql.input
class HistogramValues:
    path: str


@gql.input
class CountValues:
    path: str


@gql.input
class Aggregation:
    count_values: t.Optional[CountValues] = None
    histogram_values: t.Optional[HistogramValues] = None


HistogramValuesResponses = gql.union(
    "HistogramValuesResponses",
    (
        DatetimeHistogramValuesResponse,
        FloatHistogramValuesResponse,
        IntHistogramValuesResponse,
    ),
)

HISTOGRAM_VALUES_TYPES = {
    fo.DateField,
    fo.DateTimeField,
    fo.IntField,
    fo.FloatField,
}


@gql.type
class Aggregations:
    @gql.field
    async def aggregate(
        self,
        dataset_name: str,
        view: BSONArray,
        aggregations: t.List[Aggregation],
    ) -> t.List[
        gql.union(
            "AggregationResponses",
            (
                BoolCountValuesResponse,
                IntCountValuesResponse,
                StrCountValuesResponse,
                DatetimeHistogramValuesResponse,
                FloatHistogramValuesResponse,
                IntHistogramValuesResponse,
            ),
        )
    ]:
        view = await load_view(dataset_name, view)

        resolvers = []
        aggs = []
        for input in aggregations:
            if input.count_values:
                resolve, agg = await _count_values(view, input.count_values)
            elif input.histogram_values:
                resolve, agg = await _histogram_values(
                    view, input.histogram_values
                )

            aggs.append(agg)
            resolvers.append(resolve)

        results = await view._async_aggregate(aggs)

        responses = []
        for resolver, result in zip(resolvers, results):
            responses.append(resolver(result))

        return responses


async def load_view(
    name: str, serialized_view: BSONArray
) -> foc.SampleCollection:
    def run() -> foc.SampleCollection:
        dataset = fo.load_dataset(name)
        dataset.reload()
        return fo.DatasetView._build(dataset, serialized_view or [])

    loop = asyncio.get_running_loop()

    return await loop.run_in_executor(None, run)


async def _count_values(
    view: foc.SampleCollection, input: CountValues
) -> t.Tuple[t.Callable[[t.List], CountValuesResponses], foa.CountValues]:
    field = view.get_field(input.path)

    while isinstance(field, fo.ListField):
        field = field.field

    def resolve(data: t.List):
        _, data = data
        values = [ValueCount(count, value) for value, count in data]

        if isinstance(field, fo.StringField):
            return StrCountValuesResponse(values=values)

        if isinstance(field, fo.BooleanField):
            return BoolCountValuesResponse(values=values)

        if isinstance(field, fo.IntField):
            return IntCountValuesResponse(values=values)

    return resolve, foa.CountValues(input.path, _first=LIST_LIMIT)


async def _histogram_values(
    view: foc.SampleCollection, input: HistogramValues
) -> t.Tuple[t.Callable[[t.List], HistogramValuesResponses], foa.CountValues]:
    field = view.get_field(input.path)

    while isinstance(field, fo.ListField):
        field = field.field

    range = await view._async_aggregate(
        foa.Bounds(input.path, safe=True, _count_nonfinites=True)
    )
    range_ = range.pop("bounds")
    bins = _DEFAULT_NUM_HISTOGRAM_BINS

    if range_[0] == range_[1]:
        bins = 1
        if range_[0] is None:
            range_ = [0, 1]

    if isinstance(range_[1], datetime):
        range_ = (range_[0], range_[1] + timedelta(milliseconds=100))
    elif isinstance(range_[1], date):
        range_ = (range_[0], range_[1] + timedelta(days=1))
    else:
        range_ = (range_[0], range_[1] + 1e-6)

    if isinstance(field, fo.IntField):
        delta = range_[1] - range_[0]
        range_ = (range_[0] - 0.5, range_[1] + 0.5)
        if delta < _DEFAULT_NUM_HISTOGRAM_BINS:
            bins = delta + 1

    def resolve(data):
        counts, edges, other = data
        values = [
            HistogramValue(count, edges[i], edges[i + 1])
            for i, count in enumerate(counts)
        ]

        if isinstance(field, (fo.DateField, fo.DateTimeField)):
            return DatetimeHistogramValuesResponse(values=values)

        if isinstance(field, fo.FloatField):
            return FloatHistogramValuesResponse(values=values)

        if isinstance(field, fo.IntField):
            return DatetimeHistogramValuesResponse(values=values)

    return resolve, foa.HistogramValues(input.path, bins=bins, range=range_)
