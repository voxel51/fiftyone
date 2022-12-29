"""
FiftyOne Server ``/embeddings`` route.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import itertools

from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request

import fiftyone as fo
from fiftyone.server.decorators import route
import fiftyone.server.view as fosv

from starlette.routing import Mount, Route


MAX_CATEGORIES = 100
COLOR_BY_TYPES = (fo.StringField, fo.BooleanField, fo.IntField, fo.FloatField)

dataset_cache = {}


class OnPlotLoad(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict) -> dict:
        """Loads an embeddings plot based on the curent view."""
        dataset_name = data["datasetName"]
        brain_key = data["brainKey"]
        stages = data["view"]
        label_field = data["labelField"]

        dataset = _load_dataset(dataset_name)
        results = dataset.load_brain_results(brain_key)

        # This is the view loaded in the view bar
        view = fosv.get_view(dataset_name, stages=stages)

        patches_field = results.config.patches_field
        is_patches_plot = patches_field is not None

        # Determines which points from `results` are in `view`, which are the
        # only points we want to display in the embeddings plot
        results.use_view(view, allow_missing=True)
        curr_view = results.view

        # Color by data
        label_values = curr_view.values(label_field, unwind=True)
        field = curr_view.get_field(label_field)
        if isinstance(field, fo.FloatField):
            style = "continuous"
            values_count = None
        else:
            values_count = len(set(label_values))
            style = (
                "categorical"
                if values_count <= MAX_CATEGORIES
                else "continuous"
            )

        # This is the total number of embeddings in `results`
        index_size = results.total_index_size

        # This is the number of embeddings in `results` that exist in `view`.
        # Any operations that we do with `results` can only work with this data
        available_count = results.index_size

        # This is the number of samples/patches in `view` that `results`
        # doesn't have embeddings for
        missing_count = results.missing_size

        curr_points = results._curr_points
        if is_patches_plot:
            curr_ids = results._curr_label_ids
        else:
            curr_ids = results._curr_sample_ids

        selected = itertools.repeat(True)

        traces = {}
        for data in zip(curr_ids, curr_points, label_values, selected):
            _add_to_trace(traces, style, *data)

        return {
            "traces": traces,
            "style": style,
            "values_count": values_count,
            "index_size": index_size,
            "available_count": available_count,
            "missing_count": missing_count,
            "patches_field": patches_field,
        }


class EmbeddingsSelection(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict) -> dict:
        """Determines which points in the embeddings plot to select based on
        the current extended view.
        """
        dataset_name = data["datasetName"]
        brain_key = data["brainKey"]
        stages = data["view"]
        filters = data["filters"]
        extended_stages = data["extended"]
        extended_selection = data["extendedSelection"]

        if not filters and not extended_stages and not extended_selection:
            return {"selected": None}

        dataset = _load_dataset(dataset_name)
        results = dataset.load_brain_results(brain_key)

        # Assume `results.use_view()` was already updated by `on_plot_load()`
        # view = fosv.get_view(dataset_name, stages=stages)
        # results.use_view(view, allow_missing=True)

        patches_field = results.config.patches_field
        is_patches_plot = patches_field is not None

        if is_patches_plot:
            curr_ids = results._curr_label_ids
        else:
            curr_ids = results._curr_sample_ids

        if filters or extended_stages:
            # Select points in extended view and deselect others
            extended_view = fosv.get_view(
                dataset_name,
                stages=stages,
                filters=filters,
                extended_stages=extended_stages,
            )
            is_patches_view = extended_view._is_patches

            if is_patches_plot and not is_patches_view:
                _, id_path = extended_view._get_label_field_path(
                    patches_field, "id"
                )
                extended_ids = extended_view.values(id_path, unwind=True)
            elif is_patches_view and not is_patches_plot:
                extended_ids = extended_view.values("sample_id")
            else:
                extended_ids = extended_view.values("id")

            selected_ids = set(curr_ids) & set(extended_ids)
        else:
            selected_ids = None

        if extended_selection is not None:
            if selected_ids:
                selected_ids &= set(extended_selection)
            else:
                selected_ids = set(extended_selection)

        return {"selected": selected_ids}


class EmbeddingsExtendedStage(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict) -> dict:
        """Generates an extended stage that encodes the current selection in
        the embeddings plot.
        """
        dataset_name = data["datasetName"]
        stages = data["view"]
        patches_field = data["patchesField"]  # patches field of plot, or None
        selected_ids = data["selection"]  # selected IDs in plot

        view = fosv.get_view(dataset_name, stages=stages)

        is_patches_view = view._is_patches
        is_patches_plot = patches_field is not None

        if not is_patches_view and not is_patches_plot:
            # Samples plot and samples view
            stage = fo.Select(selected_ids)
        elif is_patches_view and is_patches_plot:
            # Patches plot and patches view
            # Here we take advantage of the fact that sample IDs are equal to
            # patch IDs
            stage = fo.Select(selected_ids)
        elif is_patches_plot and not is_patches_view:
            # Patches plot and samples view
            stage = fo.MatchLabels(fields=[patches_field], ids=selected_ids)
        else:
            # Samples plot and patches view
            stage = fo.SelectBy("sample_id", selected_ids)

        d = stage._serialize(include_uuid=False)
        return {"_cls": d["_cls"], "kwargs": dict(d["kwargs"])}


class ColorByChoices(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict) -> dict:
        """Generates a list of color-by options for an embeddings plot."""
        dataset_name = data["datasetName"]
        brain_key = data["brainKey"]

        dataset = _load_dataset(dataset_name)
        results = dataset.load_brain_results(brain_key)

        patches_field = results.config.patches_field
        is_patches_plot = patches_field is not None

        schema = dataset.get_field_schema(flat=True)

        if is_patches_plot:
            _, root = dataset._get_label_field_path(patches_field)
            root += "."
            schema = {k: v for k, v in schema.items() if k.startswith(root)}

        nested_fields = set(
            k for k, v in schema.items() if isinstance(v, fo.ListField)
        )

        fields = [
            k
            for k, v in schema.items()
            if (
                isinstance(v, COLOR_BY_TYPES)
                and not any(
                    k == r or k.startswith(r + ".") for r in nested_fields
                )
            )
        ]

        # Remove fields with no values
        counts = dataset.count(fields)
        fields = [f for f, c in zip(fields, counts) if c > 0]

        return {"fields": fields}


Embeddings = [
    Route("/embeddings/plot", OnPlotLoad),
    Route("/embeddings/selection", EmbeddingsSelection),
    Route("/embeddings/extended-stage", EmbeddingsExtendedStage),
    Route("/embeddings/color-by-choices", ColorByChoices),
]


def _load_dataset(dataset_name):
    dataset = fo.load_dataset(dataset_name)
    dataset_cache[dataset_name] = dataset
    return dataset


def _add_to_trace(traces, style, id, points, label, selected):
    key = label if style == "categorical" else "points"
    if key not in traces:
        traces[key] = []

    traces[key].append(
        {
            "id": id,
            "points": points,
            "label": label,
            "selected": selected,
        }
    )
