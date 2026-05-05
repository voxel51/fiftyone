"""
Multimodal server routes.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from starlette.endpoints import HTTPEndpoint
from starlette.exceptions import HTTPException
from starlette.requests import Request
from starlette.responses import Response

from fiftyone.multimodal.query import (
    resolve_playback_plan,
    resolve_scene_inventory,
)
from fiftyone.server import decorators

PROTOBUF_MEDIA_TYPE = "application/x-protobuf"


class SceneInventoryEndpoint(HTTPEndpoint):
    """Scene inventory query endpoint."""

    @decorators.route(parse_body=False)
    async def get(self, request: Request) -> Response:
        """Returns a serialized SceneInventory protobuf."""

        dataset_id = _get_required_path_param(request, "dataset_id")
        sample_id = _get_required_path_param(request, "sample_id")

        inventory = resolve_scene_inventory(dataset_id, sample_id)

        return Response(
            inventory.SerializeToString(),
            media_type=PROTOBUF_MEDIA_TYPE,
        )


class PlaybackPlanEndpoint(HTTPEndpoint):
    """Playback plan query endpoint."""

    @decorators.route
    async def get(self, request: Request) -> Response:
        """Returns a serialized PlaybackPlan protobuf."""

        inventory_id = _get_required_path_param(request, "inventory_id")

        plan = resolve_playback_plan(inventory_id)

        return Response(
            plan.SerializeToString(),
            media_type=PROTOBUF_MEDIA_TYPE,
        )


def _get_required_path_param(request: Request, field: str) -> str:
    value = request.path_params.get(field)

    return _require_string(value, field)


def _require_string(value, field: str) -> str:
    if not isinstance(value, str) or not value:
        raise HTTPException(
            status_code=400,
            detail=f"'{field}' is required",
        )

    return value


MultimodalRoutes = [
    (
        "/multimodal/playback-plan/{inventory_id}",
        PlaybackPlanEndpoint,
    ),
    (
        "/dataset/{dataset_id}/sample/{sample_id}/multimodal/scene-inventory",
        SceneInventoryEndpoint,
    ),
]
