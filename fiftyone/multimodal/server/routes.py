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

from fiftyone.multimodal.query import resolve_scene_inventory
from fiftyone.server import decorators

PROTOBUF_MEDIA_TYPE = "application/x-protobuf"


class SceneInventoryEndpoint(HTTPEndpoint):
    """Scene inventory query endpoint."""

    @decorators.route
    async def post(self, request: Request, data: dict) -> Response:
        """Returns a serialized SceneInventory protobuf."""

        dataset_id = _get_required_string(data, "dataset_id")
        sample_id = _get_required_string(data, "sample_id")

        inventory = resolve_scene_inventory(dataset_id, sample_id)
        return Response(
            inventory.SerializeToString(),
            media_type=PROTOBUF_MEDIA_TYPE,
        )


def _get_required_string(data: dict, field: str) -> str:
    value = data.get(field)

    if not isinstance(value, str) or not value:
        raise HTTPException(
            status_code=400,
            detail=f"'{field}' is required",
        )

    return value


MultimodalRoutes = [
    ("/multimodal/scene-inventory", SceneInventoryEndpoint),
]


__all__ = [
    "MultimodalRoutes",
    "PROTOBUF_MEDIA_TYPE",
    "SceneInventoryEndpoint",
]
