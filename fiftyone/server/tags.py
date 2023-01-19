"""
FiftyOne Server tags and tagging

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import typing as t

import fiftyone.core.collections as foc
import fiftyone.core.media as fom
import fiftyone.core.view as fov
from fiftyone.server.filters import SampleFilter

import fiftyone.server.view as fosv


def get_tag_view(
    dataset: str,
    stages: t.List,
    filters: t.Dict,
    slice: str = None,
    extended_stages: t.List = None,
    sample_ids: t.Optional[t.List[str]] = None,
    label_fields: t.List[str] = None,
    labels: t.Optional[t.List[t.Dict]] = None,
    hidden_labels: t.Optional[t.List[t.Dict]] = None,
    sample_filter: SampleFilter = None,
    target_labels: bool = False,
    modal: bool = False,
) -> foc.SampleCollection:
    view = fosv.get_view(
        dataset,
        stages=stages,
        filters=filters,
        extended_stages=extended_stages,
        sample_filter=sample_filter,
    )

    sample_ids = set(sample_ids or [])
    if labels:
        for label in labels:
            sample_ids.add(label["sample_id"])

    if sample_ids:
        view = fov.make_optimized_select_view(
            view, sample_ids, select_groups=not modal and not slice
        )
    elif view.media_type == fom.GROUP and not slice:
        view = view.select_group_slices(_allow_mixed=True)

    if target_labels:
        if labels:
            view = view.select_labels(labels)
        elif hidden_labels:
            view = view.exclude_labels(hidden_labels)
        elif label_fields:
            view = view.select_fields(label_fields)

    return view
