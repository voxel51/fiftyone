"""
Episode selection candidate routes.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import asyncio
from contextvars import copy_context
from dataclasses import asdict
import json

from bson.errors import InvalidId
from pymongo.errors import PyMongoError
from starlette.endpoints import HTTPEndpoint
from starlette.exceptions import HTTPException
from starlette.responses import JSONResponse

import fiftyone.core.json as foj
import fiftyone.core.subsets as fosub
import fiftyone.core.utils as fou
from fiftyone.server import decorators
import fiftyone.server.samples as foses
import fiftyone.server.selection as foss
import fiftyone.server.selection_jobs as fosj
import fiftyone.server.selection_navigation as fosn
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

    Present samples receive the grid's own sample node, including resolved
    media URLs for image and video previews.
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
            present = [
                sample_id
                for sample_id, details in result.items()
                if not details.get("unavailable")
            ]
            target = foss.view_dataset(dataset, stages) if present else dataset
            return target, result, present

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


_navigation_workers = asyncio.Semaphore(4)


class SelectionNavigation(HTTPEndpoint):
    """Returns a bounded neighborhood or an exact-order fallback location."""

    @decorators.route
    async def post(self, request, data):
        try:
            # Bound queueing as well as the database work. Cancelled clients
            # must not start an expensive lookup when their slot opens later.
            workers = _navigation_workers
            await asyncio.wait_for(
                workers.acquire(), timeout=fosn.QUERY_SECONDS
            )
            lookup = None
            try:
                if await request.is_disconnected():
                    return JSONResponse({}, status_code=499)
                lookup = asyncio.create_task(
                    _run_dataset_task(request, fosn.sample_neighborhood, data)
                )

                def release(completed):
                    workers.release()
                    # Retrieve errors even if the client stopped awaiting us.
                    if not completed.cancelled():
                        completed.exception()

                lookup.add_done_callback(release)
                # Cancelling an await cannot stop its executor thread. Keep
                # the slot until the bounded database operation actually ends.
                view, result = await asyncio.shield(lookup)
            finally:
                if lookup is None:
                    workers.release()
            if await request.is_disconnected():
                return JSONResponse({}, status_code=499)
            if result["kind"] == "seek":
                ids = result.pop("ids")
                nodes = await asyncio.wait_for(
                    foses.sample_nodes_for_ids(
                        view, ids, max_time_ms=fosn.QUERY_SECONDS * 1000
                    ),
                    timeout=fosn.QUERY_SECONDS,
                )
                result["nodes"] = []
                for sample_id in ids:
                    if sample_id not in nodes:
                        raise HTTPException(
                            409,
                            detail="The grid results changed; try again",
                        )
                    node = nodes[sample_id]
                    payload = foj.stringify(asdict(node))
                    payload["aspectRatio"] = payload.pop("aspect_ratio")
                    payload["__typename"] = type(node).__name__
                    if "frame_rate" in payload:
                        payload["frameRate"] = payload.pop("frame_rate")
                        payload["frameNumber"] = payload.pop("frame_number")
                    result["nodes"].append(payload)
            return result
        except PermissionError as error:
            raise HTTPException(403, detail=str(error)) from error
        except ValueError as error:
            raise HTTPException(400, detail=str(error)) from error
        except PyMongoError as error:
            if not error.timeout:
                raise
            raise HTTPException(
                408, detail="Finding this item took too long"
            ) from error
        except asyncio.TimeoutError as error:
            raise HTTPException(
                408, detail="Finding this item took too long"
            ) from error


class SelectionTags(HTTPEndpoint):
    """Reads and edits tags on complete captured membership."""

    @decorators.route
    async def post(self, request, data):
        try:
            return await _run_dataset_task(
                request, foss.tag_captured_members, data
            )
        except foss.SelectionCaptureUnavailableError as error:
            return JSONResponse({"message": str(error)}, status_code=410)
        except PermissionError as error:
            return JSONResponse({"message": str(error)}, status_code=403)
        except (ValueError, KeyError, TypeError, InvalidId) as error:
            return JSONResponse({"message": str(error)}, status_code=400)


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
                data.get("provenance"),
                data.get("lineage"),
            )
        except PermissionError as error:
            raise HTTPException(403, detail=str(error)) from error
        except ValueError as error:
            raise HTTPException(400, detail=str(error)) from error


class Subset(HTTPEndpoint):
    """Reads, edits, or deletes one dataset-scoped saved subset."""

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
    async def post(self, request, data):
        subset_id = request.path_params["subset_id"]

        def update(dataset):
            fosub.update_subset_info(dataset, subset_id, data)
            return fosub.subset_summary(dataset, subset_id)

        try:
            return await _run_dataset_task(request, update)
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
    ("/dataset/{dataset_id}/selection/navigation", SelectionNavigation),
    ("/dataset/{dataset_id}/subsets", Subsets),
    ("/dataset/{dataset_id}/subsets/add", SubsetAdd),
    ("/dataset/{dataset_id}/subsets/{subset_id}/remove", SubsetRemove),
    ("/dataset/{dataset_id}/subsets/{subset_id}", Subset),
]
