"""
FiftyOne Server runtime assets endpoints.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import os
from pathlib import PurePosixPath

from starlette.endpoints import HTTPEndpoint
from starlette.exceptions import HTTPException
from starlette.requests import Request
from starlette.responses import JSONResponse

DEFAULT_MODEL_URLS = {
    "sam2": "https://models-cdn.voxel51.com/sam2",
}


def _validate_model_id(model_id: str) -> str:
    """Validate and normalize a ``model_id`` path parameter.

    Rejects absolute paths and parent-directory traversal so a caller can't
    escape the configured family prefix.

    Args:
        model_id: the raw path parameter value

    Returns:
        the normalized POSIX-style relative path

    Raises:
        HTTPException: if the value is empty, absolute, or contains ``..``
    """
    if not model_id or model_id.startswith("/"):
        raise HTTPException(status_code=400, detail="Invalid model_id")

    parts = PurePosixPath(model_id).parts
    if any(part in ("", "..") for part in parts):
        raise HTTPException(status_code=400, detail="Invalid model_id")

    return "/".join(parts)


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
        model_id = _validate_model_id(request.path_params["model_id"])

        base_url = _get_model_base_url(family)
        url = f"{base_url}/{model_id}"

        return JSONResponse({"url": url})


RuntimeAssetRoutes = [
    (
        "/runtime-assets/models/{family}/{model_id:path}",
        ModelWeights,
    ),
]
