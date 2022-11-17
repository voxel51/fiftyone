"""
FiftyOne Server ``/embeddings`` route.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import glob
import os
import numpy as np

from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request

import eta.core.serial as etas

import fiftyone as fo
from fiftyone.server.decorators import route
import fiftyone.server.view as fosv


MAX_CATEGORIES = 100


class Embeddings(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict):
        print(data)
        datasetName = data["dataset"]
        key = data["brainKey"]
        labels_field = data["labelsField"]
        filters = data["filters"]
        extended_stages = data["extended"]
        extended_selection = data["extendedSelection"]
        stages = data["view"]
        dataset = fo.load_dataset(datasetName)

        # All available points in the index and their sample IDs
        results = dataset.load_brain_results(key)
        all_points = results.points
        all_sample_ids = results._sample_ids

        ###############################################################################
        # Now we need to figure out which points from `results` are in the view
        # currently loaded in the view bar, which are the only points we want to
        # display in the embeddings plot
        ###############################################################################

        # This is the view loaded in the view bar
        view = fosv.get_view(datasetName, stages=stages)

        # One option is to let the `results` object do the math for us
        results.use_view(view, allow_missing=True)
        curr_points = results._curr_points
        curr_sample_ids = results._curr_sample_ids
        label_values = results.view.values(labels_field)

        # TODO optimize count
        values_count = len(set(label_values))

        ###############################################################################
        # Now we need to decide whether to render any points as selected/deselected
        ###############################################################################

        if filters or extended_stages:
            # There's an extended view, so select points in the extended view and
            # deselect all others
            extended_view = fosv.get_view(
                datasetName,
                stages=stages,
                filters=filters,
                extended_stages=extended_stages,
            )
            extended_ids = extended_view.values("id")
            selected_ids = set(curr_sample_ids) & set(extended_ids)
        else:
            # No filter is applied, everything can be selected
            selected_ids = None

        if selected_ids and extended_selection:
            selected_ids = selected_ids & set(extended_selection)
        elif extended_selection:
            selected_ids = set(extended_selection)

        distinct_values = set(label_values)
        style = (
            "categorical"
            if len(distinct_values) <= MAX_CATEGORIES
            else "continuous"
        )

        zipped = zip(curr_sample_ids, curr_points, label_values)
        traces = {}
        for (id, points, label) in zipped:
            add_to_trace(traces, selected_ids, id, points, label, style)

        print(traces)

        return {"traces": traces, "style": style, "values_count": values_count}


def add_to_trace(traces, selected_ids, id, points, label, style):
    key = label if style == "categorical" else "points"
    if not key in traces:
        traces[key] = []

    traces[key].append(
        {
            "id": id,
            "points": points,
            "label": label,
            "selected": id in selected_ids if selected_ids else True,
        }
    )
