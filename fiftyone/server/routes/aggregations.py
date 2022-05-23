"""
FiftyOne Server /aggregation and /tagging routes

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request

import fiftyone as fo
import fiftyone.core.aggregations as foa
import fiftyone.core.fields as fof
import fiftyone.core.media as fom
import fiftyone.core.view as fov

from fiftyone.server.decorators import route
from fiftyone.server.utils import meets_type
import fiftyone.server.view as fosv


class CountExists(foa.Count):
    """Named helper aggregation for counting existence"""

    def __init__(self, field):
        super().__init__(field, _unwind=False)


class Aggregations(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict) -> dict:
        filters = data.get("filters", None)
        dataset = data.get("dataset", None)
        stages = data.get("view", None)
        sample_ids = data.get("sample_ids", None)
        hidden_labels = data.get("hidden_labels", None)

        view = fosv.get_view(dataset, stages=stages, filters=filters)
        view.reload()
        if sample_ids:
            view = fov.make_optimized_select_view(view, sample_ids)

        if hidden_labels:
            view = view.exclude_labels(hidden_labels)

        return {"aggregations": await get_app_statistics(view, filters)}


async def get_app_statistics(view, filters):
    """
    Builds and executes the aggregations required by App components

    Args:
        view: a :class:`fiftyone.core.collections.SampleCollection`
        filters: a `dict` defining the current App filters

    Returns:
        a `dict` mapping field paths to aggregation `dict`s
    """
    aggregations = {"": {foa.Count.__name__: foa.Count()}}
    for path, field in view.get_field_schema().items():
        aggregations.update(_build_field_aggregations(path, field, filters))

    if view.media_type == fom.VIDEO:
        for path, field in view.get_frame_field_schema().items():
            aggregations.update(
                _build_field_aggregations("frames." + path, field, filters)
            )

    ordered = [agg for path in aggregations.values() for agg in path.values()]
    results = await view._async_aggregate(ordered)

    for aggregation, result in zip(ordered, results):
        aggregations[aggregation.field_name or ""][
            aggregation.__class__.__name__
        ] = result

    return aggregations


def _build_field_aggregations(
    path: str, field: fof.Field, filters: dict, depth=0
):
    aggregations = []
    if meets_type(field, fof.FloatField):
        aggregations.append(
            foa.Bounds(
                path,
                safe=True,
                _count_nonfinites=True,
            )
        )
    elif meets_type(
        field,
        (
            fof.DateField,
            fof.DateTimeField,
            fof.IntField,
        ),
    ):
        aggregations.append(foa.Bounds(path))
    elif meets_type(field, fof.BooleanField):
        aggregations.append(foa.CountValues(path, _first=3))
    elif meets_type(field, (fof.StringField, fof.ObjectIdField)):
        aggregations.append(_get_categorical_aggregation(path, filters))

    if isinstance(field, fof.ListField) and path != "tags":
        aggregations.append(CountExists(path))

    aggregations.append(foa.Count(path))

    aggregations = {
        path: {
            aggregation.__class__.__name__: aggregation
            for aggregation in aggregations
        }
    }

    if meets_type(field, fof.EmbeddedDocumentField) and depth < 2:
        if isinstance(field, (fof.ListField)):
            field = field.field

        for subfield_name, subfield in field.get_field_schema().items():
            aggregations.update(
                _build_field_aggregations(
                    ".".join([path, subfield_name]),
                    subfield,
                    filters,
                    depth + 1,
                )
            )

    return aggregations


def _get_categorical_aggregation(path, filters):
    include = (
        None
        if filters is None or path not in filters or path == "tags"
        else filters[path]["values"]
    )
    return foa.CountValues(path, _first=200, _include=include)
