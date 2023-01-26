"""
FiftyOne Server aggregations

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from datetime import date, datetime, timedelta
import typing as t

import strawberry as gql

import fiftyone as fo
import fiftyone.core.aggregations as foa
import fiftyone.core.collections as foc

from fiftyone.server.constants import LIST_LIMIT
from fiftyone.server.data import T
from fiftyone.server.scalars import BSONArray
from fiftyone.server.view import load_view, ExtendedViewForm


_DEFAULT_NUM_HISTOGRAM_BINS = 25


@gql.type
class ValueCount(t.Generic[T]):
    key: t.Union[T, None]
    value: int


@gql.type
class CountValuesResponse(t.Generic[T]):
    values: t.List[ValueCount[T]]


@gql.type
class BoolCountValuesResponse(CountValuesResponse[bool]):
    values: t.List[ValueCount[bool]]


@gql.type
class IntCountValuesResponse(CountValuesResponse[int]):
    values: t.List[ValueCount[int]]


@gql.type
class StrCountValuesResponse(CountValuesResponse[str]):
    values: t.List[ValueCount[str]]


CountValuesResponses = gql.union(
    "CountValuesResponses",
    (BoolCountValuesResponse, IntCountValuesResponse, StrCountValuesResponse),
)
COUNT_VALUES_TYPES = {fo.BooleanField, fo.IntField, fo.StringField}


@gql.type
class HistogramValuesResponse(t.Generic[T]):
    counts: t.List[int]
    edges: t.List[T]
    other: int


@gql.type
class DatetimeHistogramValuesResponse(HistogramValuesResponse[datetime]):
    edges: t.List[datetime]


@gql.type
class FloatHistogramValuesResponse(HistogramValuesResponse[float]):
    edges: t.List[float]


@gql.type
class IntHistogramValuesResponse(HistogramValuesResponse[int]):
    edges: t.List[float]


@gql.input
class HistogramValues:
    field: str


@gql.input
class CountValues:
    field: str


@gql.input
class Aggregate:
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
class AggregateQuery:
    @gql.field
    async def aggregate(
        self,
        dataset_name: str,
        view: t.Optional[BSONArray],
        aggregations: t.List[Aggregate],
        view_name: t.Optional[str] = None,
        form: t.Optional[ExtendedViewForm] = None,
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
        view = await load_view(
            dataset_name=dataset_name,
            serialized_view=view,
            view_name=view_name,
            form=(form or ExtendedViewForm()),
        )

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


async def _count_values(
    view: foc.SampleCollection, input: CountValues
) -> t.Tuple[t.Callable[[t.List], CountValuesResponses], foa.CountValues]:
    field = view.get_field(input.field)

    while isinstance(field, fo.ListField):
        field = field.field

    def resolve(data: t.List):
        _, data = data
        values = [ValueCount(key=value, value=count) for value, count in data]

        if isinstance(field, fo.StringField):
            return StrCountValuesResponse(values=values)

        if isinstance(field, fo.BooleanField):
            return BoolCountValuesResponse(values=values)

        if isinstance(field, fo.IntField):
            return IntCountValuesResponse(values=values)

    return resolve, foa.CountValues(input.field, _first=LIST_LIMIT, _asc=False)


async def _histogram_values(
    view: foc.SampleCollection, input: HistogramValues
) -> t.Tuple[t.Callable[[t.List], HistogramValuesResponses], foa.CountValues]:
    field = view.get_field(input.field)

    while isinstance(field, fo.ListField):
        field = field.field

    range = await view._async_aggregate(
        foa.Bounds(input.field, safe=True, _count_nonfinites=True)
    )
    range_ = range.pop("bounds")
    bins = _DEFAULT_NUM_HISTOGRAM_BINS

    if isinstance(field, fo.IntField):
        if range_[0] is None:
            range_ = (0, 0)
        delta = range_[1] - range_[0]
        range_ = (range_[0] - 1, range_[1] + 1)
        if delta < _DEFAULT_NUM_HISTOGRAM_BINS:
            bins = delta + 1

    if range_[0] == range_[1]:
        bins = 1
        if range_[0] is None:
            range_ = [0, 1]

    if isinstance(range_[1], datetime):
        range_ = (range_[0], range_[1] + timedelta(milliseconds=100))
    elif isinstance(range_[1], date):
        range_ = (range_[0], range_[1] + timedelta(days=1))
    elif not isinstance(field, fo.IntField):
        range_ = (range_[0], range_[1] + 1e-6)

    def resolve(data):
        counts, edges, other = data
        data = {"counts": counts, "edges": edges, "other": other}
        if isinstance(field, (fo.DateField, fo.DateTimeField)):
            return DatetimeHistogramValuesResponse(**data)

        if isinstance(field, fo.FloatField):
            return FloatHistogramValuesResponse(**data)

        if isinstance(field, fo.IntField):
            return IntHistogramValuesResponse(**data)

    return resolve, foa.HistogramValues(input.field, bins=bins, range=range_)
