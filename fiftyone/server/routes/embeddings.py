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
        return _post_sync(data)


def _post_sync(data):
    dataset = _load_dataset(data["datasetName"])
    results, error = _load_brain_results(dataset, data["brainKey"])
    if error:
        return {"error": error}

    view = _get_filtered_view(data, dataset)

    index_size, available_count, missing_count = _compute_embedding_counts(
        results, view
    )

    traces, style = _generate_traces(
        view,
        results,
        data["labelField"],
        data["slices"],
        data.get("density", 0.05),
    )

    return {
        "traces": traces,
        "style": style,
        "index_size": index_size,
        "available_count": available_count,
        "missing_count": missing_count,
        "patches_field": results.config.patches_field,
    }


def _load_dataset(dataset_name):
    return fosu.load_and_cache_dataset(dataset_name)


def _load_brain_results(dataset, brain_key):
    try:
        results = dataset.load_brain_results(brain_key)
        if results is None:
            return (
                None,
                f"Results for brain run with key '{brain_key}' are not yet available",
            )
    except Exception:
        return (
            None,
            f"Failed to load results for brain run with key '{brain_key}'. Try regenerating the results",
        )

    return results, None


def _get_filtered_view(data, dataset):
    return fosv.get_view(
        data["datasetName"],
        stages=data["view"],
        filters=data.get("filters", None),
        sample_filter=get_sample_filter(data["slices"]),
    )


def _compute_embedding_counts(results, view):
    if view.view() != results.view.view():
        results.use_view(view, allow_missing=True)

    return results.total_index_size, results.index_size, results.missing_size


def _generate_traces(view, results, label_field, slices, density):
    is_patches_plot = results.config.patches_field is not None
    ids, sample_ids = _get_ids(results, is_patches_plot)
    points, ids = _sub_sample(results._curr_points, ids, density)

    labels, style = _get_label_data(
        view, label_field, ids, is_patches_plot, results.config.patches_field
    )

    traces = {}
    for data in zip(points, ids, sample_ids, labels, itertools.repeat(True)):
        _add_to_trace(traces, style, *data)

    return traces, style


def _get_ids(results, is_patches_plot):
    if is_patches_plot:
        return results._curr_label_ids, results._curr_sample_ids
    return results._curr_sample_ids, itertools.repeat(None)


def _get_label_data(view, label_field, ids, is_patches_view, patches_field):
    if not label_field:
        return itertools.repeat(None), "uncolored"

    if is_patches_view:
        view = view._root_dataset
        _, root = view._get_label_field_path(patches_field)
        leaf = label_field[len(root) + 1 :]
        _, label_field = view._get_label_field_path(patches_field, leaf)

    labels = view._get_values_by_id(label_field, ids, link_field=patches_field)
    field = view.get_field(label_field)

    if isinstance(field, fof.ListField):
        labels = [l[0] if l else None for l in labels]
        field = field.field

    style = (
        "continuous"
        if isinstance(field, fof.FloatField)
        else _determine_style(labels)
    )
    return labels, style


def _determine_style(labels):
    return (
        "categorical" if len(set(labels)) <= MAX_CATEGORIES else "continuous"
    )


def _sub_sample(points, ids, density):
    import random

    sample_size = int(len(points) * density)
    indices = random.sample(range(len(points)), sample_size)
    sub_points = [points[i] for i in indices]
    sub_ids = [ids[i] for i in indices]
    return sub_points, sub_ids


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
        lassoPoints = data["lassoPoints"]

        print("EmbeddingsSelection lassoPoints")
        print(lassoPoints)

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
        lassoPoints = data["lassoPoints"]

        print("EmbeddingsExtendedStage lasso_points_as_tuples")
        lasso_points_as_tuples = get_fiftyone_geowithin(lassoPoints)
        print(lasso_points_as_tuples)

        if lasso_points_as_tuples and len(lasso_points_as_tuples[0]) > 0:

            stage = fos.Mongo(
                [
                    {
                        "$match": {
                            # TODO: can't hardcode "point"
                            "point": {
                                "$geoWithin": {
                                    "$geometry": {
                                        "type": "Polygon",
                                        "coordinates": [
                                            lasso_points_as_tuples
                                        ],  # GeoJSON requires an array of linear rings
                                    }
                                }
                            }
                        }
                    }
                ]
            )
            d = stage._serialize(include_uuid=False)
            return {"_cls": d["_cls"], "kwargs": dict(d["kwargs"])}

        view = fosv.get_view(
            dataset_name,
            stages=stages,
            sample_filter=get_sample_filter(slices),
        )

        is_patches_view = view._is_patches
        is_patches_plot = patches_field is not None

        if not is_patches_view and not is_patches_plot:
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


def get_fiftyone_geowithin(lasso_points):
    """
    Convert lasso points dictionary to the FiftyOne $geoWithin view stage format.

    Args:
        lasso_points (Dict[str, List[float]]): A dictionary containing 'x' and 'y' lists of coordinates.
            Example input format:
            {
                'x': [-0.924, -0.982, -1.068, ...],
                'y': [-0.075, -0.046, -0.028, ...]
            }

    Returns:
        List[List[float]]: A list of coordinate pairs formatted for FiftyOne's $geoWithin view stage.
            Example output format:
            [
                [-0.924, -0.075],
                [-0.982, -0.046],
                [-1.068, -0.028],
                ...
            ]
    """
    if "x" not in lasso_points or "y" not in lasso_points:
        raise ValueError(
            "Input dictionary must contain 'x' and 'y' keys with coordinate lists."
        )

    if len(lasso_points["x"]) != len(lasso_points["y"]):
        raise ValueError("The 'x' and 'y' lists must have the same length.")

    # Convert x and y coordinates to the required FiftyOne format
    coordinates = [
        [x, y] for x, y in zip(lasso_points["x"], lasso_points["y"])
    ]

    # If last point is not the same as first, add it
    if coordinates[0] != coordinates[-1]:
        coordinates.append(coordinates[0])

    return coordinates


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
