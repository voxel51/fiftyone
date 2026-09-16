"""
Episode selection candidate routes.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from starlette.endpoints import HTTPEndpoint
from starlette.exceptions import HTTPException

import fiftyone.core.utils as fou
import fiftyone.core.subsets as fosub
from bson.errors import InvalidId
import fiftyone.server.selection as foss
from fiftyone.server import decorators
from fiftyone.server.utils.datasets import get_dataset


class SelectionCandidates(HTTPEndpoint):
    """Counts the current result scope and describes requested parents."""

    @decorators.route
    async def post(self, request, data):
        """Returns exact scope counts plus groups for ``episodeIds`` only."""
        dataset = get_dataset(request.path_params["dataset_id"])
        try:
            return await fou.run_sync_task(foss.resolve_scope, dataset, data)
        except ValueError as error:
            raise HTTPException(400, detail=str(error)) from error

    @decorators.route
    async def get(self, request):
        """Returns built-in provider options."""
        dataset = get_dataset(request.path_params["dataset_id"])
        return await fou.run_sync_task(foss.provider_options, dataset)


class SelectionSnapshots(HTTPEndpoint):
    """Freezes the complete result scope server-side for a bulk action."""

    @decorators.route
    async def post(self, request, data):
        dataset = get_dataset(request.path_params["dataset_id"])
        try:
            return await fou.run_sync_task(foss.create_snapshot, dataset, data)
        except ValueError as error:
            raise HTTPException(400, detail=str(error)) from error

    @decorators.route
    async def get(self, request):
        """Returns built-in provider options."""
        dataset = get_dataset(request.path_params["dataset_id"])
        return await fou.run_sync_task(foss.provider_options, dataset)


class SelectionAvailability(HTTPEndpoint):
    """Checks captured parent references independently of browsing filters."""

    @decorators.route
    async def post(self, request, data):
        dataset = get_dataset(request.path_params["dataset_id"])
        return await fou.run_sync_task(
            foss.selection_availability,
            dataset,
            data["episodeIds"],
            data.get("view"),
        )


class SelectionTags(HTTPEndpoint):
    """Reads and edits tags on complete captured membership."""

    @decorators.route
    async def post(self, request, data):
        dataset = get_dataset(request.path_params["dataset_id"])
        try:
            members, stages = await fou.run_sync_task(
                foss.resolve_members, dataset, data
            )
            return await fou.run_sync_task(
                foss.tag_selection,
                dataset,
                members,
                data.get("change"),
                data.get("target", "members"),
                stages,
                data.get("groups", "slice"),
            )
        except (ValueError, KeyError, TypeError, InvalidId) as error:
            raise HTTPException(400, detail=str(error)) from error


class Subsets(HTTPEndpoint):
    """Lists and creates dataset-scoped saved subsets."""

    @decorators.route
    async def get(self, request):
        dataset = get_dataset(request.path_params["dataset_id"])
        return {
            "subsets": await fou.run_sync_task(fosub.list_subsets, dataset)
        }

    @decorators.route
    async def post(self, request, data):
        dataset = get_dataset(request.path_params["dataset_id"])
        try:
            return await fou.run_sync_task(
                fosub.create_subset, dataset, data.get("name")
            )
        except ValueError as error:
            raise HTTPException(400, detail=str(error)) from error


class SubsetAdd(HTTPEndpoint):
    """Freezes and applies an add with a reusable operation identity."""

    @decorators.route
    async def post(self, request, data):
        dataset = get_dataset(request.path_params["dataset_id"])
        try:
            if data.get("phase") == "prepare":
                members, _ = await fou.run_sync_task(
                    foss.resolve_members, dataset, data
                )
                return await fou.run_sync_task(
                    fosub.prepare_add,
                    dataset,
                    data["subsetId"],
                    data["operationId"],
                    members,
                )
            if data.get("phase") == "apply":
                return await fou.run_sync_task(
                    fosub.apply_add, dataset, data["operationId"]
                )
            raise ValueError("Choose prepare or apply")
        except (ValueError, KeyError, TypeError, InvalidId) as error:
            raise HTTPException(400, detail=str(error)) from error


SelectionRoutes = [
    ("/dataset/{dataset_id}/selection", SelectionCandidates),
    ("/dataset/{dataset_id}/selection/snapshots", SelectionSnapshots),
    ("/dataset/{dataset_id}/selection/tags", SelectionTags),
    ("/dataset/{dataset_id}/selection/availability", SelectionAvailability),
    ("/dataset/{dataset_id}/subsets", Subsets),
    ("/dataset/{dataset_id}/subsets/add", SubsetAdd),
]
