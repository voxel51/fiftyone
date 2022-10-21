"""
FiftyOne Server aggregations

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from datetime import date, datetime
import typing as t

import asyncio
from dacite import Config, from_dict
import strawberry as gql

import fiftyone.core.aggregations as foa
import fiftyone.core.collections as foc
import fiftyone.core.fields as fof
from fiftyone.core.utils import datetime_to_timestamp, deserialize_numpy_array
import fiftyone.core.view as fov

from fiftyone.server.constants import LIST_LIMIT
from fiftyone.server.filters import GroupElementFilter, SampleFilter
from fiftyone.server.scalars import BSON, BSONArray
from fiftyone.server.utils import meets_type
import fiftyone.server.view as fosv


@gql.input
class SelectedLabel:
    label_id: gql.ID
    field: str
    sample_id: gql.ID
    frame_number: t.Optional[int]


@gql.input
class AggregateForm:
    dataset: str
    extended_stages: BSONArray
    filters: t.Optional[BSON]
    group_id: t.Optional[gql.ID]
    hidden_labels: t.List[SelectedLabel]
    mixed: bool
    paths: t.List[str]
    sample_ids: t.List[gql.ID]
    slice: t.Optional[str]
    view: BSONArray


@gql.interface
class Aggregation:
    path: str
    count: int
    exists: int


@gql.type
class BooleanAggregation(Aggregation):
    false: int
    true: int


@gql.type
class DataAggregation(Aggregation):
    pass


@gql.type
class IntAggregation(Aggregation):
    max: t.Optional[float]
    min: t.Optional[float]


@gql.type
class FloatAggregation(Aggregation):
    inf: int
    max: t.Optional[float]
    min: t.Optional[float]
    nan: int
    ninf: int


@gql.type
class RootAggregation(Aggregation):
    slice: t.Optional[int]


@gql.type
class StringAggregationValue:
    count: int
    value: str


@gql.type
class StringAggregation(Aggregation):
    values: t.List[StringAggregationValue]


AggregateResult = gql.union(
    "AggregateResult",
    (
        BooleanAggregation,
        DataAggregation,
        IntAggregation,
        FloatAggregation,
        RootAggregation,
        StringAggregation,
    ),
)


async def aggregate_resolver(
    form: AggregateForm,
) -> t.List[AggregateResult]:
    view = fosv.get_view(
        form.dataset,
        stages=form.view,
        filters=form.filters,
        extended_stages=form.extended_stages,
        sample_filter=SampleFilter(
            group=GroupElementFilter(id=form.group_id, slice=form.slice)
        ),
    )

    if form.sample_ids:
        view = fov.make_optimized_select_view(view, form.sample_ids)

    if form.hidden_labels:
        view = view.exclude_labels(form.hidden_labels)

    if form.mixed:
        view = view.select_group_slices(_allow_mixed=True)

    aggregations, deserializers = zip(
        *[_resolve_path_aggregation(path, view) for path in form.paths]
    )
    counts = [len(a) for a in aggregations]
    flattened = []
    for aggs in aggregations:
        flattened += aggs

    result = await view._async_aggregate(flattened)
    results = []
    offset = 0
    for length, deserialize in zip(counts, deserializers):
        results.append(deserialize(result[offset : length + offset]))
        offset += length

    if form.mixed and "" in form.paths:
        slice_view = fosv.get_view(
            form.dataset,
            stages=form.view,
            filters=form.filters,
            extended_stages=form.extended_stages,
            sample_filter=SampleFilter(
                group=GroupElementFilter(id=form.group_id, slice=form.slice)
            ),
        )

        for result in results:
            if isinstance(result, RootAggregation):
                result.slice = await slice_view._async_aggregate(foa.Count())
                break

    return results


RESULT_MAPPING = {
    fof.BooleanField: BooleanAggregation,
    fof.EmbeddedDocumentField: DataAggregation,
    fof.FrameNumberField: IntAggregation,
    fof.DateField: IntAggregation,
    fof.DateTimeField: IntAggregation,
    fof.IntField: IntAggregation,
    fof.FloatField: FloatAggregation,
    fof.ObjectIdField: StringAggregation,
    fof.StringField: StringAggregation,
}


def _resolve_path_aggregation(
    path: str, view: foc.SampleCollection
) -> AggregateResult:
    aggregations: t.List[foa.Aggregation] = [foa.Count(path if path else None)]
    field = view.get_field(path)
    while isinstance(field, fof.ListField):
        field = field.field

    cls = RESULT_MAPPING[field.__class__] if path else RootAggregation

    if meets_type(field, fof.BooleanField):
        aggregations.append(foa.CountValues(path))

    elif meets_type(field, (fof.DateField, fof.DateTimeField, fof.IntField)):
        aggregations.append(foa.Bounds(path))

    elif meets_type(field, fof.FloatField):
        aggregations.append(
            foa.Bounds(
                path,
                safe=True,
                _count_nonfinites=True,
            )
        )

    elif meets_type(field, (fof.ObjectIdField, fof.StringField)):
        aggregations.append(foa.CountValues(path, _first=LIST_LIMIT))

    if isinstance(field, fof.ListField):
        aggregations.append(_CountExists(path))

    data = {"path": path}

    def from_results(results):
        for aggregation, result in zip(aggregations, results):
            if isinstance(aggregation, foa.Bounds):
                if isinstance(field, fof.FloatField):
                    mn, mx = result["bounds"]
                    data["inf"] = result["inf"]
                    data["min"] = mn
                    data["max"] = mx
                    data["nan"] = result["nan"]
                    data["ninf"] = result["-inf"]
                else:
                    mn, mx = result
                    data["min"] = (
                        datetime_to_timestamp(mn)
                        if meets_type(mn, (datetime, date))
                        else mn
                    )
                    data["max"] = (
                        datetime_to_timestamp(mx)
                        if meets_type(mx, (datetime, date))
                        else mx
                    )
            elif isinstance(aggregation, foa.Count):
                data["count"] = result
            elif isinstance(aggregation, foa.CountValues):
                if isinstance(field, fof.BooleanField):
                    data["true"] = result.get(True, 0)
                    data["false"] = result.get(False, 0)
                else:
                    _, result = result
                    data["values"] = [
                        {"value": value, "count": count}
                        for value, count in result
                    ]
            elif isinstance(aggregation, _CountExists):
                data["exists"] = result

            if "exists" not in data:
                data["exists"] = data["count"]

        return from_dict(cls, data, config=Config(check_types=False))

    return aggregations, from_results


class _CountExists(foa.Count):
    """Named helper aggregation for counting existence"""

    def __init__(self, field):
        super().__init__(field, _unwind=False)
