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
class CountValuesResponse(t.Generic[T]):
    values: t.List[ValueCount[T]]


CountValuesResponses = gql.union(
    "CountValuesResponses",
    (
        CountValuesResponse[bool],
        CountValuesResponse[int],
        CountValuesResponse[str],
    ),
)
COUNT_VALUES_TYPES = {fo.BooleanField, fo.IntField, fo.StringField}


@gql.type
class HistogramValue(t.Generic[T]):
    count: int
    min: T
    max: T


@gql.type
class HistogramValuesResponse(t.Generic[T]):
    values: t.List[HistogramValue[T]]


HistogramValuesResponses = gql.union(
    "HistogramValuesResponses",
    (
        HistogramValuesResponse[datetime],
        HistogramValuesResponse[int],
        HistogramValuesResponse[float],
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
    async def count_values(
        dataset_name: str, view: BSONArray, path: str
    ) -> CountValuesResponses:
        view = await load_view(dataset_name, view)
        field = view.get_field(path)

        while isinstance(field, fo.ListField):
            field = field.field

        _, data = await view._async_aggregate(
            foa.CountValues(path, _first=LIST_LIMIT)
        )
        return CountValuesResponse(
            [ValueCount(count, value) for value, count in data]
        )

    @gql.field
    async def histogram_values(
        dataset_name: str, view: BSONArray, path: str
    ) -> HistogramValuesResponses:
        view = await load_view(dataset_name, view)
        field = view.get_field(path)

        while isinstance(field, fo.ListField):
            field = field.field

        range = await view._async_aggregate(
            foa.Bounds(path, safe=True, _count_nonfinites=True)
        )
        range = range.pop("bounds")
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

        result = [{"key": k, "count": v} for k, v in result.items() if v > 0]

        if isinstance(field, fo.IntField):
            delta = range_[1] - range_[0]
            range_ = (range_[0] - 0.5, range_[1] + 0.5)
            if delta < _DEFAULT_NUM_HISTOGRAM_BINS:
                bins = delta + 1

        counts, edges, other = await view._async_aggregate(
            foa.HistogramValues(path, bins=bins, range=range_)
        )

        return HistogramValuesResponse(
            [
                HistogramValue(count, edges[i], edges[i + 1])
                for i, count in enumerate(counts)
            ]
        )


async def load_view(
    name: str, serialized_view: BSONArray
) -> foc.SampleCollection:
    def run() -> foc.SampleCollection:
        dataset = fo.load_dataset(name)
        dataset.reload()
        return fo.DatasetView._build(dataset, serialized_view or [])

    loop = asyncio.get_running_loop()

    return await loop.run_in_executor(None, run)
