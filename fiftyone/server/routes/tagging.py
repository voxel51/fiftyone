"""
FiftyOne Server /tagging route

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict

from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request

import fiftyone.core.aggregations as foa
import fiftyone.core.collections as foc
import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.media as fom
import fiftyone.core.view as fov

from fiftyone.server.decorators import route
import fiftyone.server.view as fosv


class Tagging(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict) -> dict:
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
        return "%s.%s" % (
            root,
            label_field.document_type._LABEL_LIST_FIELD,
        )

    return root
