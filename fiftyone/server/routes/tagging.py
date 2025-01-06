"""
FiftyOne Server /tagging route

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from collections import defaultdict

from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request

import fiftyone.core.aggregations as foa
import fiftyone.core.collections as foc
import fiftyone.core.labels as fol
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
        slices = data.get("slices", None)
        group_id = data.get("group_id", None)
        slice = data.get("slice", None)
        view = await fost.get_tag_view(
            dataset,
            stages=stages,
            filters=filters,
            extended_stages=extended,
            label_fields=label_fields,
            labels=labels,
            hidden_labels=hidden_labels,
            sample_filter=SampleFilter(
                group=(
                    GroupElementFilter(slice=slice, id=group_id, slices=slices)
                    if not sample_ids
                    else None
                )
            ),
            sample_ids=sample_ids,
            target_labels=target_labels,
        )

        if target_labels:
            count_aggs, tag_aggs = build_label_tag_aggregations(view)
            results = await view._async_aggregate(count_aggs + tag_aggs)
            items = None
            count = sum(results[: len(count_aggs)])
            tags = defaultdict(int)

            for result in results[len(count_aggs) :]:
                for tag, num in result.items():
                    if tag is None:
                        continue

                    tags[tag] += num
        else:
            tags, items = await view._async_aggregate(
                [foa.CountValues("tags"), foa.Count()]
            )
            count = sum([v for k, v in tags.items() if k is not None])

        return {"count": count, "tags": tags, "items": items}


def build_label_tag_aggregations(sample_collection: foc.SampleCollection):
    counts = []
    tags = []
    for path, field in foc._iter_label_fields(sample_collection):
        label_type = field.document_type
        if issubclass(label_type, fol._HasLabelList):
            path += "." + label_type._LABEL_LIST_FIELD

        counts.append(foa.Count(path))
        tags.append(foa.CountValues(path + ".tags"))

    return counts, tags
