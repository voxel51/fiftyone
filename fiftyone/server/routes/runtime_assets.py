"""
FiftyOne Server runtime assets endpoints.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_

"""

import os
from pathlib import Path, PurePosixPath

from starlette.endpoints import HTTPEndpoint
from starlette.exceptions import HTTPException
from starlette.requests import Request
from starlette.responses import FileResponse, JSONResponse

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


def _get_model_base(family: str) -> str:
    """Resolve the base URL or local path for a model family.

    Checks for an environment variable override first
    (e.g. ``FIFTYONE_MODEL_WEIGHTS_BASE_SAM2``), then falls back to the
    built-in default.

    The value may be:

    * An ``http://`` / ``https://`` URL — the browser fetches the model
      file directly from that origin.
    * A local filesystem path — the FiftyOne server streams the file bytes
      to the browser via its own same-origin endpoint (no separate file
      server or CORS configuration needed).

    Args:
        family: the model family name (e.g. ``"sam2"``)

    Returns:
        the base URL or absolute filesystem path for the model family

    Raises:
        HTTPException: if no URL is configured for the family
    """
    env_key = f"FIFTYONE_MODEL_WEIGHTS_BASE_{family.upper()}"
    value = os.environ.get(env_key)

    if value:
        return value.rstrip("/")

    default = DEFAULT_MODEL_URLS.get(family)
    if default:
        return default.rstrip("/")

    raise HTTPException(
        status_code=404,
        detail=f"No model weights configured for family '{family}'",
    )


def _is_local_path(base: str) -> bool:
    return not (base.startswith("http://") or base.startswith("https://"))


class ModelWeights(HTTPEndpoint):
    """Resolves a download URL for a model weights file.

    ``GET /runtime-assets/models/{family}/{model_id}``

    Returns a JSON response with the resolved URL for the requested model
    file. Deployments can override the default public URLs by setting
    environment variables like ``FIFTYONE_MODEL_WEIGHTS_BASE_SAM2``.

    When the env var points to a local filesystem path the returned URL
    routes back through this server's :class:`ModelWeightsServe` endpoint so
    the browser never needs to reach a separate file server.
    """

    async def get(self, request: Request) -> JSONResponse:
        family = request.path_params["family"]
        model_id = _validate_model_id(request.path_params["model_id"])

        base = _get_model_base(family)

        if _is_local_path(base):
            # Return a same-origin URL — the FiftyOne server already has
            # allow_origins=* CORS middleware, so the browser worker can fetch
            # it without a separate file server or CORS headers.
            origin = f"{request.url.scheme}://{request.url.netloc}"
            url = f"{origin}/runtime-assets/model-files/{family}/{model_id}"
        else:
            url = f"{base}/{model_id}"

        return JSONResponse({"url": url})


class ModelWeightsServe(HTTPEndpoint):
    """Stream a model weights file from a local filesystem path.

    ``GET /runtime-assets/model-files/{family}/{model_id}``

    Only reachable when ``FIFTYONE_MODEL_WEIGHTS_BASE_<FAMILY>`` is set to a
    local directory path.  Path traversal is rejected before any I/O.
    """

    async def get(self, request: Request) -> FileResponse:
        family = request.path_params["family"]
        model_id = _validate_model_id(request.path_params["model_id"])

        base = _get_model_base(family)

        if not _is_local_path(base):
            raise HTTPException(
                status_code=404,
                detail="Local file serving is only enabled for filesystem paths",
            )

        abs_base = Path(base).resolve()
        abs_path = (abs_base / model_id).resolve()

        # Guard against path traversal that _validate_model_id might not catch
        # on non-POSIX systems.
        if not str(abs_path).startswith(str(abs_base) + os.sep):
            raise HTTPException(
                status_code=403, detail="Path traversal rejected"
            )

        if not abs_path.is_file():
            raise HTTPException(
                status_code=404,
                detail=f"Model file not found: {model_id}",
            )

        return FileResponse(str(abs_path))


RuntimeAssetRoutes = [
    (
        "/runtime-assets/models/{family}/{model_id:path}",
        ModelWeights,
    ),
    (
        "/runtime-assets/model-files/{family}/{model_id:path}",
        ModelWeightsServe,
    ),
]
