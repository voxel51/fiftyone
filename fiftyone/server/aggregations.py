"""
FiftyOne Server aggregations.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import fiftyone.core.aggregations as foa
import fiftyone.core.collections as foc
import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.media as fom

from fiftyone.server.utils import meets_type
from fiftyone.server.json_util import convert


def build_label_tag_aggregations(view: foc.SampleCollection):
    """Builds required aggregations for the specialty "tag" App filters

    Args:
        view: a :class:`fiftyone.core.collections.SampleCollection`

    Returns:
        a `tuple` (count aggregations, tag count aggregations)
    """
    counts = []
    tags = []
    for field_name, field in view.get_field_schema().values():
        _add_to_label_tags_aggregations(field_name, field, counts, tags)

    if view.media_type == fom.VIDEO:
        for field_name, field in view.get_frame_field_schema().values():
            _add_to_label_tags_aggregations(field_name, field, counts, tags)

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
    # @todo optmizie by removing unnecessary extended view aggregations, e.g. Bounds
    aggregations = {"": foa.Count()}
    for path, field in view.get_field_schema().items():
        aggregations.update(_build_field_aggregations(path, field, filters))

    if view.media_type == fom.VIDEO:
        for path, field in view.get_frame_field_schema().items():
            aggregations.update(
                _build_field_aggregations("frames." + path, field, filters)
            )

    ordered = [agg for path in aggregations.values() for agg in path]
    results = await view._async_aggregate(ordered)
    convert(results)

    for aggregation, result in zip(ordered, results):
        aggregations[aggregation.field_name][
            aggregation.__class__.__name__
        ] = result

    return aggregations


def _build_field_aggregations(path: str, field: fof.Field, filters: dict):
    aggregations = []
    if meets_type(
        field,
        (fof.DateField, fof.DateTimeField, fof.FloatField, fof.IntField,),
    ):
        aggregations.append(foa.Bounds(path))
    elif meets_type(field, fof.BooleanField):
        aggregations.append(foa.CountValues(path, _first=3))
    elif meets_type(field, (fof.StringField, fof.ObjectIdField)):
        aggregations.append(_get_categorical_aggregation(path, filters))

    aggregations.append(foa.Count(path))

    aggregations = {
        path: {
            aggregations.__class__.__name__: aggregation
            for aggregation in aggregations
        }
    }

    if meets_type(field, fof.EmbeddedDocumentField):
        if isinstance(field, (fof.ListField)):
            field = field.field

        for subfield_name, subfield in field.get_field_schema().items():
            if subfield_name == "tags" and issubclass(
                field.document_type, fol.Label
            ):
                continue

            aggregations.update(
                _build_field_aggregations(
                    ".".join([path, subfield_name]), subfield, filters
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

    path = _expand_labels_path(path, field)
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
