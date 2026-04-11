"""
FiftyOne Server /tagging route

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import asyncio
from collections import defaultdict

from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request

import fiftyone.core.aggregations as foa
import fiftyone.core.collections as foc
import fiftyone.core.dataset as fod
import fiftyone.core.labels as fol
import fiftyone.core.odm as foo
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

        is_filtered = bool(
            stages
            or filters
            or extended
            or sample_ids
            or labels
            or hidden_labels
        )

        if target_labels:
            count_aggs, tag_aggs = build_label_tag_aggregations(view)

            if is_filtered:
                view_result, all_tags = await asyncio.gather(
                    view._async_aggregate(count_aggs + tag_aggs),
                    _get_all_dataset_tags(dataset, target_labels),
                )
                results = view_result
            else:
                results = await view._async_aggregate(count_aggs + tag_aggs)

            items = None
            count = sum(results[: len(count_aggs)])
            tags = defaultdict(int)

            for result in results[len(count_aggs) :]:
                for tag, num in result.items():
                    if tag is None:
                        continue

                    tags[tag] += num

            if not is_filtered:
                all_tags = sorted(t for t in tags.keys() if t is not None)
        else:
            if is_filtered:
                (tags, items), all_tags = await asyncio.gather(
                    view._async_aggregate(
                        [foa.CountValues("tags"), foa.Count()]
                    ),
                    _get_all_dataset_tags(dataset, target_labels),
                )
            else:
                tags, items = await view._async_aggregate(
                    [foa.CountValues("tags"), foa.Count()]
                )

            count = sum([v for k, v in tags.items() if k is not None])

            if not is_filtered:
                all_tags = sorted(t for t in tags.keys() if t is not None)

        return {
            "count": count,
            "tags": tags,
            "items": items,
            "all_tags": all_tags,
        }


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


async def _get_all_dataset_tags(dataset_name, target_labels):
    """Returns all distinct tag names from the unfiltered dataset.

    For sample tags, uses the indexed ``distinct`` command.
    For label tags, uses ``_async_aggregate`` with parallelization.
    """
    ds = fod.load_dataset(dataset_name, reload=False)

    if target_labels:
        _, tag_aggs = build_label_tag_aggregations(ds)
        results = await ds._async_aggregate(tag_aggs)
        all_tags = set()
        for result in results:
            all_tags.update(tag for tag in result.keys() if tag is not None)
        return sorted(all_tags)
    else:
        coll_name = ds._sample_collection_name
        collection = foo.get_async_db_conn()[coll_name]
        result = await collection.distinct("tags")
        return sorted(v for v in result if v is not None)
