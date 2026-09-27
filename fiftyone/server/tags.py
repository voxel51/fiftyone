"""
FiftyOne Server tags and tagging

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import typing as t

import fiftyone.core.aggregations as foa
import fiftyone.core.collections as foc
import fiftyone.core.labels as fol
import fiftyone.core.view as fov
from fiftyone.core.utils import run_sync_task

from fiftyone.server.filters import SampleFilter
import fiftyone.server.view as fosv


async def get_tag_view(
    dataset: str,
    stages: t.List,
    filters: t.Dict,
    extended_stages: t.List = None,
    label_fields: t.List[str] = None,
    labels: t.Optional[t.List[t.Dict]] = None,
    hidden_labels: t.Optional[t.List[t.Dict]] = None,
    sample_filter: SampleFilter = None,
    target_labels: bool = False,
    sample_ids: t.List[str] = None,
) -> foc.SampleCollection:
    view = await fosv.get_view(
        dataset,
        stages=stages,
        filters=filters,
        extended_stages=extended_stages,
        sample_filter=sample_filter,
        awaitable=True,
    )

    def run(view):
        if sample_ids:
            view = fov.make_optimized_select_view(
                view, sample_ids, flatten=True
            )

        if target_labels:
            if labels:
                view = view.select_labels(labels)
            elif hidden_labels:
                view = view.exclude_labels(hidden_labels)
            elif label_fields:
                view = view.select_fields(label_fields)

        return view

    return await run_sync_task(run, view)


def build_label_tag_aggregations(sample_collection: foc.SampleCollection):
    """Builds counts and tag histograms for all labels in a collection."""
    counts = []
    tags = []
    for path, field in foc._iter_label_fields(sample_collection):
        label_type = field.document_type
        if issubclass(label_type, fol._HasLabelList):
            path += "." + label_type._LABEL_LIST_FIELD

        counts.append(foa.Count(path))
        tags.append(foa.CountValues(path + ".tags"))

    return counts, tags
