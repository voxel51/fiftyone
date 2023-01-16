"""
FiftyOne Server aggregations

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging
from dataclasses import asdict
from datetime import date, datetime
import typing as t

from dacite import Config, from_dict
import strawberry as gql

import fiftyone.core.aggregations as foa
import fiftyone.core.collections as foc
import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.media as fom
from fiftyone.core.utils import datetime_to_timestamp
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
    frame_number: t.Optional[int] = None


@gql.input
class AggregationForm:
    dataset: str
    extended_stages: BSONArray
    filters: t.Optional[BSON]
    group_id: t.Optional[gql.ID]
    hidden_labels: t.List[SelectedLabel]
    index: t.Optional[int]
    mixed: bool
    paths: t.List[str]
    sample_ids: t.List[gql.ID]
    slice: t.Optional[str]
    view: BSONArray
    view_name: t.Optional[str] = None


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
    expanded_field_count: int
    frame_label_field_count: t.Optional[int] = None


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
    form: AggregationForm,
) -> t.List[AggregateResult]:
    if not form.dataset:
        raise ValueError("Aggregate form missing dataset")

    view = fosv.get_view(
        form.dataset,
        view_name=form.view_name or None,
        stages=form.view,
        filters=form.filters,
        extended_stages=form.extended_stages,
        sample_filter=SampleFilter(
            group=GroupElementFilter(id=form.group_id, slice=form.slice)
        ),
    )

    slice_view = view if form.mixed and "" in form.paths else None

    if form.sample_ids:
        view = fov.make_optimized_select_view(view, form.sample_ids)

    if form.hidden_labels:
        view = view.exclude_labels(
            [
                {
                    "sample_id": l.sample_id,
                    "field": l.field,
                    "label_id": l.label_id,
                    "frame_number": l.frame_number,
                }
                for l in form.hidden_labels
            ]
        )

    if form.mixed:
        view = view.select_group_slices(_allow_mixed=True)

    aggregations, deserializers = zip(
        *[_resolve_path_aggregation(path, view) for path in form.paths]
    )
    counts = [len(a) for a in aggregations]
    flattened = [item for sublist in aggregations for item in sublist]

    # TODO: stop aggregate resolver from being called for non-existent fields,
    #  but fail silently for now by just returning empty results
    try:
        result = await view._async_aggregate(flattened)
    except:
        return []

    results = []
    offset = 0
    for length, deserialize in zip(counts, deserializers):
        results.append(deserialize(result[offset : length + offset]))
        offset += length

    if slice_view:
        for result in results:
            if isinstance(result, RootAggregation):
                result.slice = await slice_view._async_aggregate(foa.Count())
                break

    return results


RESULT_MAPPING = {
    fof.BooleanField: BooleanAggregation,
    fof.EmbeddedDocumentField: DataAggregation,
    fof.DictField: DataAggregation,
    fof.FrameNumberField: IntAggregation,
    fof.GeoMultiPointField: DataAggregation,
    fof.GeoMultiPolygonField: DataAggregation,
    fof.GeoMultiLineStringField: DataAggregation,
    fof.GeoPointField: DataAggregation,
    fof.GeoLineStringField: DataAggregation,
    fof.GeoPolygonField: DataAggregation,
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
    aggregations: t.List[foa.Aggregation] = [
        foa.Count(path if path and path != "" else None)
    ]
    field = view.get_field(path)

    while isinstance(field, fof.ListField):
        field = field.field

    cls = (
        RESULT_MAPPING.get(field.__class__, DataAggregation)
        if path
        else RootAggregation
    )

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

        if cls == RootAggregation:
            data["expanded_field_count"] = _count_expanded_fields(
                view._root_dataset
            )
            if view._root_dataset.media_type == fom.VIDEO:
                data["frame_label_field_count"] = len(
                    view._root_dataset.get_frame_field_schema(
                        embedded_doc_type=fol.Label
                    )
                )
        return from_dict(cls, data, config=Config(check_types=False))

    return aggregations, from_results


class _CountExists(foa.Count):
    """Named helper aggregation for counting existence"""

    def __init__(self, field):
        super().__init__(field, _unwind=False)


def _count_expanded_fields(collection: foc.SampleCollection) -> int:
    schema = collection._root_dataset.get_field_schema()
    count = 0
    for field in schema.values():
        while isinstance(field, fof.ListField):
            field = field.field

        if (
            isinstance(field, fof.EmbeddedDocumentField)
            and field.document_type is not None
            and not issubclass(field.document_type, fol.Label)
        ):
            count += len(field.fields)
        else:
            count += 1

    return count
