"""
FiftyOne Server aggregations.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict

import tornado

import fiftyone.core.aggregations as foa
import fiftyone.core.collections as foc
import fiftyone.core.expressions as foe
import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.media as fom
import fiftyone.core.view as fov

from fiftyone.server.json_util import convert
from fiftyone.server.state import catch_errors
from fiftyone.server.utils import AsyncRequestHandler, meets_type
import fiftyone.server.view as fosv


class CountExists(foa.Count):
    """Named helper aggregation for counting existence"""

    def __init__(self, field):
        super().__init__(field, _unwind=False)


class AggregationsHandler(AsyncRequestHandler):
    @catch_errors
    async def post_response(self):
        data = tornado.escape.json_decode(self.request.body)

        filters = data.get("filters", None)
        dataset = data.get("dataset", None)
        stages = data.get("view", None)
        sample_ids = data.get("sample_ids", None)
        hidden_labels = data.get("hidden_labels", None)

        view = fosv.get_view(dataset, stages=stages, filters=filters)

        if sample_ids:
            view = fov.make_optimized_select_view(view, sample_ids)

        if hidden_labels:
            view = view.exclude_labels(hidden_labels)

        result = await get_app_statistics(view, filters)
        return convert(result)


class TagAggregationsHandler(AsyncRequestHandler):
    @catch_errors
    async def post_response(self):
        data = tornado.escape.json_decode(self.request.body)

        filters = data.get("filters", None)
        dataset = data.get("dataset", None)
        stages = data.get("view", None)
        sample_ids = data.get("sample_ids", None)
        labels = data.get("labels", None)
        count_labels = data.get("count_labels", False)
        active_label_fields = data.get("active_label_fields", [])
        hidden_labels = data.get("hidden_labels", None)

        view = fosv.get_view(dataset, stages=stages, filters=filters)

        if sample_ids:
            view = fov.make_optimized_select_view(view, sample_ids)

        if count_labels and labels:
            view = view.select_labels(labels)
        elif count_labels and hidden_labels:
            view = view.exclude_labels(hidden_labels)

        if count_labels:
            view = view.select_fields(active_label_fields)
            count_aggs, tag_aggs = build_label_tag_aggregations(view)
            results = await view._async_aggregate(count_aggs + tag_aggs)

            count = sum(results[: len(count_aggs)])
            tags = defaultdict(int)

            for result in results[len(count_aggs) :]:
                for tag, num in result.items():
                    tags[tag] += num
        else:
            tags = await view._async_aggregate(foa.CountValues("tags"))
            count = sum(tags.values())

        return {"count": count, "tags": tags}


def build_label_tag_aggregations(view: foc.SampleCollection):
    """Builds required aggregations for the specialty "tag" App filters

    Args:
        view: a :class:`fiftyone.core.collections.SampleCollection`

    Returns:
        a `tuple` (count aggregations, tag count aggregations)
    """
    counts = []
    tags = []
    for field_name, field in view.get_field_schema().items():
        _add_to_label_tags_aggregations(field_name, field, counts, tags)

    if view.media_type == fom.VIDEO:
        for field_name, field in view.get_frame_field_schema().items():
            _add_to_label_tags_aggregations(
                "frames." + field_name, field, counts, tags
            )

    return counts, tags


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
    convert(results)

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
            foa.Bounds(path, safe=True, _count_nonfinites=True,)
        )
    elif meets_type(field, (fof.DateField, fof.DateTimeField, fof.IntField,),):
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


def _add_to_label_tags_aggregations(path: str, field: fof.Field, counts, tags):
    if not isinstance(field, fof.EmbeddedDocumentField):
        return

    if not issubclass(field.document_type, fol.Label):
        return

    path = _expand_labels_path(path, field)
    counts.append(foa.Count(path))
    tags.append(foa.CountValues("%s.tags" % path))


def _expand_labels_path(root, label_field):
    if issubclass(label_field.document_type, fol._HasLabelList):
        return "%s.%s" % (root, label_field.document_type._LABEL_LIST_FIELD,)

    return root


def _get_categorical_aggregation(path, filters):
    include = (
        None
        if filters is None or path not in filters or path == "tags"
        else filters[path]["values"]
    )
    return foa.CountValues(path, _first=200, _include=include)
