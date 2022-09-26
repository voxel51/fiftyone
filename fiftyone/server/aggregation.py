"""
FiftyOne Server aggregations

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import typing as t

import asyncio
from dacite import Config, from_dict
import strawberry as gql

import fiftyone.core.aggregations as foa
import fiftyone.core.collections as foc
import fiftyone.core.fields as fof
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
class AggregationForm:
    dataset: str
    extended_stages: BSONArray
    filters: t.Optional[BSON]
    group_id: t.Optional[gql.ID]
    hidden_labels: t.List[SelectedLabel]
    mixed: bool
    path: str
    sample_ids: t.List[gql.ID]
    slice: t.Optional[str]
    view: BSONArray


@gql.interface
class Aggregation:
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
    max: float
    min: float


@gql.type
class FloatAggregation(Aggregation):
    inf: int
    max: float
    min: float
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


AggreationResult = t.Union[
    BooleanAggregation,
    DataAggregation,
    IntAggregation,
    FloatAggregation,
    RootAggregation,
    StringAggregation,
]


async def aggregation_resolver(
    form: AggregationForm,
) -> AggreationResult:
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

    resolve = [_resolve_path_aggregation(form.path, view)]
    if form.mixed and not form.path:
        view = view.select_group_slices(_allow_mixed=True)
        slice_view = fosv.get_view(
            form.dataset,
            stages=form.view,
            filters=form.filters,
            extended_stages=form.extended_stages,
            sample_filter=SampleFilter(
                group=GroupElementFilter(id=form.group_id, slice=form.slice)
            ),
        )

        resolve.append(slice_view._async_aggregate(foa.Count()))

    result = await asyncio.gather(*resolve)

    if form.mixed and not form.path:
        result, slice = result
        result.slice = slice

    return result


RESULT_MAPPING = {
    fof.BooleanField: BooleanAggregation,
    fof.EmbeddedDocumentField: DataAggregation,
    fof.IntField: IntAggregation,
    fof.FloatField: FloatAggregation,
    fof.StringField: StringAggregation,
}


async def _resolve_path_aggregation(
    path: str, view: foc.SampleCollection
) -> AggreationResult:
    aggregations: t.List[foa.Aggregation] = [foa.Count(path)]
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

    elif meets_type(field, fof.StringField):
        aggregations.append(foa.CountValues(path, _first=LIST_LIMIT))

    if isinstance(field, fof.ListField):
        aggregations.append(_CountExists(path))

    results = await view._async_aggregate(aggregations)

    data = {}
    for aggregation, result in zip(aggregations, results):
        if isinstance(aggregation, foa.Bounds):
            data[""]
        elif isinstance(aggregation, foa.Count):
            data["count"] = result
        elif isinstance(aggregation, _CountExists):
            data["exists"] = result

    if "exists" not in data:
        data["exists"] = data["count"]

    return from_dict(cls, data, config=Config(check_types=False))


class _CountExists(foa.Count):
    """Named helper aggregation for counting existence"""

    def __init__(self, field):
        super().__init__(field, _unwind=False)
