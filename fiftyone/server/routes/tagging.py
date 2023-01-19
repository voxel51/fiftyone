"""
FiftyOne Server /tagging route

| Copyright 2017-2023, Voxel51, Inc.
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

from fiftyone.server.decorators import route
from fiftyone.server.filters import GroupElementFilter, SampleFilter
import fiftyone.server.tags as fost


class Tagging(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict) -> dict:
        filters = data.get("filters", None)
        dataset = data.get("dataset", None)
        stages = data.get("view", None)
        sample_ids = data.get("sample_ids", None)
        labels = data.get("labels", None)
        target_labels = data.get("target_labels", False)
        label_fields = data.get("label_fields", [])
        hidden_labels = data.get("hidden_labels", None)
        extended = data.get("extended", None)
        slice = data.get("slice", None)
        group_id = data.get("group_id", None)
        modal = data.get("modal", False)

        view = fost.get_tag_view(
            dataset,
            stages=stages,
            filters=filters,
            slice=slice,
            extended_stages=extended,
            label_fields=label_fields,
            labels=labels,
            hidden_labels=hidden_labels,
            sample_ids=sample_ids,
            sample_filter=SampleFilter(
                group=GroupElementFilter(id=group_id, slice=slice)
            ),
            target_labels=target_labels,
            modal=modal,
        )

        if target_labels:
            count_aggs, tag_aggs = build_label_tag_aggregations(view)
            results = await view._async_aggregate(count_aggs + tag_aggs)
            items = None
            count = sum(results[: len(count_aggs)])
            tags = defaultdict(int)

            for result in results[len(count_aggs) :]:
                for tag, num in result.items():
                    tags[tag] += num
        else:
            tags, items = await view._async_aggregate(
                [foa.CountValues("tags"), foa.Count()]
            )
            count = sum(tags.values())

        return {"count": count, "tags": tags, "items": items}


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

    if view.media_type != fom.IMAGE and view.get_frame_field_schema():
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
