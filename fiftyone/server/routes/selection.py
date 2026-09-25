"""
Episode selection candidate routes.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from contextvars import copy_context
from dataclasses import asdict
import json

from bson.errors import InvalidId
from starlette.endpoints import HTTPEndpoint
from starlette.exceptions import HTTPException

import fiftyone.core.json as foj
import fiftyone.core.media as fom
import fiftyone.core.subsets as fosub
import fiftyone.core.utils as fou
from fiftyone.server import decorators
import fiftyone.server.samples as foses
import fiftyone.server.selection as foss
import fiftyone.server.selection_jobs as fosj
from fiftyone.server.utils.datasets import get_dataset


async def _run_dataset_task(request, func, *args):
    """Loads the dataset and runs a synchronous operation in one worker.

    Dataset loading can perform database and permission I/O. Keep it in the
    same context-preserving handoff as the operation that consumes it.
    """
    dataset_id = request.path_params["dataset_id"]

    def run():
        return func(get_dataset(dataset_id), *args)

    return await fou.run_sync_task(copy_context().run, run)


class SelectionCandidates(HTTPEndpoint):
    """Counts the current result scope and describes requested parents."""

    @decorators.route
    async def post(self, request, data):
        """Returns exact scope counts plus groups for ``episodeIds`` only."""
        try:
            return await _run_dataset_task(request, foss.resolve_scope, data)
        except PermissionError as error:
            raise HTTPException(403, detail=str(error)) from error
        except ValueError as error:
            raise HTTPException(400, detail=str(error)) from error

    @decorators.route
    async def get(self, request):
        """Returns built-in provider options."""
        return await _run_dataset_task(request, foss.provider_options)


class SelectionSnapshots(HTTPEndpoint):
    """Freezes the complete result scope server-side for a bulk action."""

    @decorators.route
    async def post(self, request, data):
        try:
            return await _run_dataset_task(request, foss.create_snapshot, data)
        except PermissionError as error:
            raise HTTPException(403, detail=str(error)) from error
        except ValueError as error:
            raise HTTPException(400, detail=str(error)) from error

    @decorators.route
    async def get(self, request):
        """Returns built-in provider options."""
        return await _run_dataset_task(request, foss.provider_options)


class SelectionAvailability(HTTPEndpoint):
    """Checks captured parent references independently of browsing filters.

    Reference-backed and 3D samples also receive the grid's own sample node,
    so tray previews render through the same renderer as grid tiles.
    """

    @decorators.route
    async def post(self, request, data):
        if not isinstance(data.get("episodeIds"), list):
            raise HTTPException(400, detail="episodeIds must be a list")
        stages = data.get("view")

        def run(dataset):
            result = foss.selection_availability(
                dataset, data["episodeIds"], stages
            )
            rendered = (
                dataset.media_type == fom.MULTIMODAL
                or dataset._contains_media_references()
            )
            present = [
                sample_id
                for sample_id, details in result.items()
                if not details.get("unavailable")
                and (
                    rendered
                    or fom.get_media_type(details.get("filepath") or "")
                    in (fom.THREE_D, fom.POINT_CLOUD)
                )
            ]
            if present and stages:
                if foss.view_dataset(dataset, stages) is not dataset:
                    present = []
            return dataset, result, present

        try:
            dataset, result, present = await _run_dataset_task(request, run)
        except PermissionError as error:
            raise HTTPException(403, detail=str(error)) from error
        except ValueError as error:
            raise HTTPException(400, detail=str(error)) from error
        if present:
            nodes = await foses.sample_nodes_for_ids(dataset, present)
            for sample_id, node in nodes.items():
                payload = foj.stringify(asdict(node))
                payload["aspectRatio"] = payload.pop("aspect_ratio", None)
                result[sample_id]["node"] = payload
        return result


class SelectionPosition(HTTPEndpoint):
    """Locates one sample within the grid's paginated order."""

    @decorators.route
    async def post(self, request, data):
        try:
            return await _run_dataset_task(request, foss.sample_position, data)
        except PermissionError as error:
            raise HTTPException(403, detail=str(error)) from error
        except ValueError as error:
            raise HTTPException(400, detail=str(error)) from error


class SelectionTags(HTTPEndpoint):
    """Reads and edits tags on complete captured membership."""

    @decorators.route
    async def post(self, request, data):
        try:
            return await _run_dataset_task(
                request, foss.tag_captured_members, data
            )
        except PermissionError as error:
            raise HTTPException(403, detail=str(error)) from error
        except (ValueError, KeyError, TypeError, InvalidId) as error:
            raise HTTPException(400, detail=str(error)) from error


class Subsets(HTTPEndpoint):
    """Lists and creates dataset-scoped saved subsets."""

    @decorators.route
    async def get(self, request):
        params = request.query_params
        try:
            dataset = await fou.run_sync_task(
                copy_context().run,
                get_dataset,
                request.path_params["dataset_id"],
            )
            skip = int(params.get("skip", 0))
            limit = params.get("limit")
            limit = int(limit) if limit is not None else None
        except PermissionError as error:
            raise HTTPException(403, detail=str(error)) from error
        except ValueError as error:
            raise HTTPException(
                400, detail="skip and limit must be integers"
            ) from error
        try:
            view = json.loads(params["view"]) if params.get("view") else None
            return await fosub.async_browse_subsets(
                dataset,
                params.get("search") or None,
                skip,
                limit,
                view,
            )
        except (ValueError, KeyError, TypeError) as error:
            raise HTTPException(400, detail=str(error)) from error

    @decorators.route
    async def post(self, request, data):
        try:
            return await _run_dataset_task(
                request,
                fosub.create_subset,
                data.get("name"),
                data.get("description"),
                data.get("view"),
                data.get("preferredGroupSlice"),
            )
        except PermissionError as error:
            raise HTTPException(403, detail=str(error)) from error
        except ValueError as error:
            raise HTTPException(400, detail=str(error)) from error


class Subset(HTTPEndpoint):
    """Reads or deletes one dataset-scoped saved subset."""

    @decorators.route
    async def get(self, request):
        try:
            subset_id = request.path_params["subset_id"]
            if request.query_params.get("counts") == "true":
                return await _run_dataset_task(
                    request, fosub.subset_summary, subset_id, True
                )
            dataset = await fou.run_sync_task(
                copy_context().run,
                get_dataset,
                request.path_params["dataset_id"],
            )
            return await fosub.async_subset_summary(dataset, subset_id)
        except PermissionError as error:
            raise HTTPException(403, detail=str(error)) from error
        except (ValueError, InvalidId) as error:
            raise HTTPException(400, detail=str(error)) from error

    @decorators.route
    async def delete(self, request):
        try:
            return await _run_dataset_task(
                request,
                fosub.delete_subset,
                request.path_params["subset_id"],
            )
        except PermissionError as error:
            raise HTTPException(403, detail=str(error)) from error
        except (ValueError, InvalidId) as error:
            raise HTTPException(400, detail=str(error)) from error


class SubsetAdd(HTTPEndpoint):
    """Freezes and applies an add with a reusable operation identity."""

    @decorators.route
    async def post(self, request, data):
        try:
            if data.get("phase") == "prepare":
                return await _run_dataset_task(
                    request, foss.prepare_subset_add, data
                )
            if data.get("phase") == "apply":
                return await _run_dataset_task(
                    request, fosub.apply_add, data["operationId"]
                )
            raise ValueError("Choose prepare or apply")
        except PermissionError as error:
            raise HTTPException(403, detail=str(error)) from error
        except (ValueError, KeyError, TypeError, InvalidId) as error:
            raise HTTPException(400, detail=str(error)) from error


class SubsetRemove(HTTPEndpoint):
    """Removes captured members from a dataset-scoped subset."""

    @decorators.route
    async def post(self, request, data):
        try:
            return await _run_dataset_task(
                request,
                foss.remove_captured_members,
                request.path_params["subset_id"],
                data,
            )
        except PermissionError as error:
            raise HTTPException(403, detail=str(error)) from error
        except (ValueError, KeyError, TypeError, InvalidId) as error:
            raise HTTPException(400, detail=str(error)) from error


class SelectionJobs(HTTPEndpoint):
    """Starts long selection work and returns an immediately pollable handle."""

    @decorators.route
    async def post(self, request, data):
        try:
            return await _run_dataset_task(request, fosj.start_job, data)
        except PermissionError as error:
            raise HTTPException(403, detail=str(error)) from error
        except (ValueError, KeyError, TypeError, InvalidId) as error:
            raise HTTPException(400, detail=str(error)) from error


class SelectionJob(HTTPEndpoint):
    """Reads, cancels, or retries a caller-owned selection job."""

    @decorators.route
    async def get(self, request):
        try:
            return await _run_dataset_task(
                request, fosj.get_job, request.path_params["job_id"]
            )
        except PermissionError as error:
            raise HTTPException(403, detail=str(error)) from error
        except ValueError as error:
            raise HTTPException(404, detail=str(error)) from error

    @decorators.route
    async def post(self, request, data):
        try:
            action = data.get("action")
            if action not in ("cancel", "retry"):
                raise ValueError("Choose cancel or retry")
            return await _run_dataset_task(
                request,
                fosj.cancel_job if action == "cancel" else fosj.retry_job,
                request.path_params["job_id"],
            )
        except PermissionError as error:
            raise HTTPException(403, detail=str(error)) from error
        except ValueError as error:
            raise HTTPException(400, detail=str(error)) from error


SelectionRoutes = [
    ("/dataset/{dataset_id}/selection/jobs", SelectionJobs),
    ("/dataset/{dataset_id}/selection/jobs/{job_id}", SelectionJob),
    ("/dataset/{dataset_id}/selection", SelectionCandidates),
    ("/dataset/{dataset_id}/selection/snapshots", SelectionSnapshots),
    ("/dataset/{dataset_id}/selection/tags", SelectionTags),
    ("/dataset/{dataset_id}/selection/availability", SelectionAvailability),
    ("/dataset/{dataset_id}/selection/position", SelectionPosition),
    ("/dataset/{dataset_id}/subsets", Subsets),
    ("/dataset/{dataset_id}/subsets/add", SubsetAdd),
    ("/dataset/{dataset_id}/subsets/{subset_id}/remove", SubsetRemove),
    ("/dataset/{dataset_id}/subsets/{subset_id}", Subset),
]
