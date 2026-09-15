"""
Episode selection candidate routes.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from starlette.endpoints import HTTPEndpoint
from starlette.exceptions import HTTPException

import fiftyone.core.utils as fou
import fiftyone.server.selection as foss
from fiftyone.server import decorators
from fiftyone.server.utils.datasets import get_dataset


class SelectionCandidates(HTTPEndpoint):
    """Resolves the complete current result scope."""

    @decorators.route
    async def post(self, request, data):
        """Returns grouped candidates and actual member counts."""
        dataset = get_dataset(request.path_params["dataset_id"])
        try:
            return await fou.run_sync_task(
                foss.resolve_candidates, dataset, data
            )
        except ValueError as error:
            raise HTTPException(400, detail=str(error)) from error

    @decorators.route
    async def get(self, request):
        """Returns built-in provider options."""
        dataset = get_dataset(request.path_params["dataset_id"])
        return await fou.run_sync_task(foss.provider_options, dataset)


SelectionRoutes = [
    ("/dataset/{dataset_id}/selection", SelectionCandidates),
]
