"""
FiftyOne Server runtime assets endpoints.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import os

from starlette.endpoints import HTTPEndpoint
from starlette.exceptions import HTTPException
from starlette.requests import Request
from starlette.responses import JSONResponse

DEFAULT_MODEL_URLS = {
    "sam2": "https://models-cdn.voxel51.com/sam2",
}


def _get_model_base_url(family: str) -> str:
    """Resolve the base URL for a model family.

    Checks for an environment variable override first
    (e.g. ``FIFTYONE_MODEL_WEIGHTS_BASE_SAM2``), then falls back to the
    built-in default.

    Args:
        family: the model family name (e.g. ``"sam2"``)

    Returns:
        the base URL for the model family

    Raises:
        HTTPException: if no URL is configured for the family
    """
    env_key = f"FIFTYONE_MODEL_WEIGHTS_BASE_{family.upper()}"
    url = os.environ.get(env_key)

    if url:
        return url.rstrip("/")

    default = DEFAULT_MODEL_URLS.get(family)
    if default:
        return default.rstrip("/")

    raise HTTPException(
        status_code=404,
        detail=f"No model weights configured for family '{family}'",
    )


class ModelWeights(HTTPEndpoint):
    """Resolves a download URL for a model weights file.

    ``GET /runtime-assets/models/{family}/{model_id}``

    Returns a JSON response with the resolved URL for the requested model
    file. Deployments can override the default public URLs by setting
    environment variables like ``FIFTYONE_MODEL_WEIGHTS_BASE_SAM2``.
    """

    async def get(self, request: Request) -> JSONResponse:
        """Returns the download URL for the requested model weights file.

        Args:
            request: Starlette request with ``family`` and ``model_id`` in
                path params

        Returns:
            JSON response containing ``{"url": "<resolved_url>"}``
        """
        family = request.path_params["family"]
        model_id = request.path_params["model_id"]

        base_url = _get_model_base_url(family)
        url = f"{base_url}/{model_id}"

        return JSONResponse({"url": url})


RuntimeAssetRoutes = [
    (
        "/runtime-assets/models/{family}/{model_id:path}",
        ModelWeights,
    ),
]
