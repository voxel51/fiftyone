"""
FiftyOne Server ``/embeddings`` route.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import itertools

from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request

import fiftyone.core.fields as fof
import fiftyone.core.stages as fos
from fiftyone.core.utils import run_sync_task

from fiftyone.server.decorators import route
import fiftyone.server.utils as fosu
import fiftyone.server.view as fosv
from fiftyone.server.filters import GroupElementFilter, SampleFilter


MAX_CATEGORIES = 100
COLOR_BY_TYPES = (
    fof.StringField,
    fof.BooleanField,
    fof.IntField,
    fof.FloatField,
)


def get_sample_filter(slices):
    if slices:
        return SampleFilter(group=GroupElementFilter(id=None, slices=slices))


class OnPlotLoad(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict) -> dict:
        """Loads an embeddings plot based on the current view."""
        return await run_sync_task(self._post_sync, data)

    def _post_sync(self, data):
        dataset_name = data["datasetName"]
        brain_key = data["brainKey"]
        stages = data["view"]
        filters = data.get("filters", None)
        label_field = data["labelField"]
        slices = data["slices"]
        dataset = fosu.load_and_cache_dataset(dataset_name)

        try:
            results = dataset.load_brain_results(brain_key)
        except:
            msg = (
                "Failed to load results for brain run with key '%s'. Try "
                "regenerating the results"
            ) % brain_key
            return {"error": msg}

        if results is None:
            msg = (
                "Results for brain run with key '%s' are not yet available"
                % brain_key
            )
            return {"error": msg}

        view = fosv.get_view(
            dataset_name,
            stages=stages,
            filters=filters,
            sample_filter=get_sample_filter(slices),
        )

        is_patches_view = view._is_patches

        patches_field = results.config.patches_field
        is_patches_plot = patches_field is not None
        points_field = results.config.points_field

        # Determines which points from `results` are in `view`, which are the
        # only points we want to display in the embeddings plot
        if view.view() != results.view.view():
            results.use_view(view, allow_missing=True)

        # The total number of embeddings in `results`
        index_size = results.total_index_size

        # The number of embeddings in `results` that exist in `view`. Any
        # operations that we do with `results` can only work with this data
        available_count = results.index_size

        # The number of samples/patches in `view` that `results` doesn't have
        # embeddings for
        missing_count = results.missing_size

        points = results._curr_points
        if is_patches_plot:
            ids = results._curr_label_ids
            sample_ids = results._curr_sample_ids
        else:
            ids = results._curr_sample_ids
            sample_ids = itertools.repeat(None)

        # Color by data
        if label_field:
            if is_patches_view and not is_patches_plot:
                # Must use the root dataset in order to retrieve colors for the
                # plot, which is linked to samples, not patches
                view = view._root_dataset

            if is_patches_view and is_patches_plot:
                # `label_field` is always provided with respect to root
                # dataset, so we must translate for patches views
                _, root = dataset._get_label_field_path(patches_field)
                leaf = label_field[len(root) + 1 :]
                _, label_field = view._get_label_field_path(
                    patches_field, leaf
                )

            labels = view._get_values_by_id(
                label_field, ids, link_field=patches_field
            )

            field = view.get_field(label_field)

            if isinstance(field, fof.ListField):
                labels = [l[0] if l else None for l in labels]
                field = field.field

            if isinstance(field, fof.FloatField):
                style = "continuous"
            else:
                if len(set(labels)) <= MAX_CATEGORIES:
                    style = "categorical"
                else:
                    style = "continuous"
        else:
            labels = itertools.repeat(None)
            style = "uncolored"

        selected = itertools.repeat(True)

        traces = {}
        for data in zip(points, ids, sample_ids, labels, selected):
            _add_to_trace(traces, style, *data)

        return {
            "traces": traces,
            "style": style,
            "index_size": index_size,
            "available_count": available_count,
            "missing_count": missing_count,
            "patches_field": patches_field,
            "points_field": points_field,
        }


class EmbeddingsSelection(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict) -> dict:
        """Determines which points in the embeddings plot to select based on
        the current extended view.
        """
        return await run_sync_task(self._post_sync, data)

    def _post_sync(self, data):
        dataset_name = data["datasetName"]
        brain_key = data["brainKey"]
        stages = data["view"]
        filters = data["filters"]
        slices = data["slices"]
        extended_stages = data["extended"]
        extended_selection = data["extendedSelection"]

        if not filters and not extended_stages and not extended_selection:
            return {"selected": None}

        dataset = fosu.load_and_cache_dataset(dataset_name)
        results = dataset.load_brain_results(brain_key)

        view = fosv.get_view(
            dataset_name,
            stages=stages,
            sample_filter=get_sample_filter(slices),
        )
        if view.view() != results.view.view():
            results.use_view(view, allow_missing=True)

        patches_field = results.config.patches_field
        is_patches_plot = patches_field is not None

        if is_patches_plot:
            ids = results._curr_label_ids
        else:
            ids = results._curr_sample_ids

        if filters or extended_stages:
            extended_view = fosv.get_view(
                dataset_name,
                stages=stages,
                filters=filters,
                extended_stages=extended_stages,
                sample_filter=get_sample_filter(slices),
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

            selected_ids = set(ids) & set(extended_ids)
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
        return await run_sync_task(self._post_sync, data)

    def _post_sync(self, data):
        dataset_name = data["datasetName"]
        stages = data["view"]
        patches_field = data["patchesField"]  # patches field of plot, or None
        selected_ids = data["selection"]  # selected IDs in plot
        slices = data["slices"]
        lasso_points = data.get("lassoPoints", None)
        points_field = data.get("pointsField", None)

        view = fosv.get_view(
            dataset_name,
            stages=stages,
            sample_filter=get_sample_filter(slices),
        )

        is_patches_view = view._is_patches
        is_patches_plot = patches_field is not None
        view_and_plot_source_are_equal = is_patches_view == is_patches_plot

        if (
            lasso_points is not None
            and points_field is not None
            and view_and_plot_source_are_equal
        ):
            # Lasso points via spatial index
            # Unfortunately we can't use $geoWithin to filter nested arrays.
            # The user must have switched to a patches view for this
            if patches_field is not None:
                _, points_field = view._get_label_field_path(
                    patches_field, points_field
                )

            stage = fos.Mongo(
                [
                    {
                        "$match": {
                            points_field: {
                                "$geoWithin": {
                                    "$polygon": [
                                        [x, y]
                                        for x, y in zip(
                                            lasso_points["x"],
                                            lasso_points["y"],
                                        )
                                    ]
                                }
                            }
                        }
                    }
                ]
            )
        elif not is_patches_view and not is_patches_plot:
            # Samples plot and samples view
            stage = fos.Select(selected_ids)
        elif is_patches_view and is_patches_plot:
            # Patches plot and patches view
            # Here we take advantage of the fact that sample IDs are equal to
            # patch IDs
            stage = fos.Select(selected_ids)
        elif is_patches_plot and not is_patches_view:
            # Patches plot and samples view
            stage = fos.MatchLabels(fields=[patches_field], ids=selected_ids)
        else:
            # Samples plot and patches view
            stage = fos.SelectBy("sample_id", selected_ids)

        d = stage._serialize(include_uuid=False)
        return {"_cls": d["_cls"], "kwargs": dict(d["kwargs"])}


class ColorByChoices(HTTPEndpoint):
    @route
    async def post(self, request: Request, data: dict) -> dict:
        """Generates a list of color-by field choices for an embeddings plot."""
        return await run_sync_task(self._post_sync, data)

    def _post_sync(self, data):
        dataset_name = data["datasetName"]
        brain_key = data["brainKey"]

        dataset = fosu.load_and_cache_dataset(dataset_name)
        info = dataset.get_brain_info(brain_key)

        patches_field = info.config.patches_field
        is_patches_plot = patches_field is not None

        schema = dataset.get_field_schema(flat=True)

        if is_patches_plot:
            _, root = dataset._get_label_field_path(patches_field)
            root += "."
            schema = {k: v for k, v in schema.items() if k.startswith(root)}

        bad_roots = tuple(
            k + "." for k, v in schema.items() if isinstance(v, fof.ListField)
        )

        fields = [
            path
            for path, field in schema.items()
            if (
                (
                    isinstance(field, COLOR_BY_TYPES)
                    or (
                        isinstance(field, fof.ListField)
                        and isinstance(field.field, COLOR_BY_TYPES)
                    )
                )
                and not path.startswith(bad_roots)
            )
        ]

        return {"fields": fields}


EmbeddingsRoutes = [
    ("/embeddings/plot", OnPlotLoad),
    ("/embeddings/selection", EmbeddingsSelection),
    ("/embeddings/extended-stage", EmbeddingsExtendedStage),
    ("/embeddings/color-by-choices", ColorByChoices),
]


def _add_to_trace(traces, style, points, id, sample_id, label, selected):
    key = label if style == "categorical" else "points"
    if key not in traces:
        traces[key] = []

    traces[key].append(
        {
            "points": points,
            "id": id,
            "sample_id": sample_id or id,
            "label": label,
            "selected": selected,
        }
    )
