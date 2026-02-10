"""
FiftyOne file operations routes.

- ``POST /files/upload`` -- upload a file
- ``DELETE /files`` -- delete a file

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response


class FileUpload(HTTPEndpoint):
    """Handles file uploads from the browser.

    Query Parameters:
        path: Destination file path (required)

    Body:
        Binary file content (streamed)

    Returns:
        201: ``{"path": "<resolved_path>"}``
        4xx/5xx: ``{"error": {"code": "...", "message": "..."}}``
    """

    async def post(self, request: Request) -> JSONResponse:
        raise NotImplementedError("TODO: implement")


class FileDelete(HTTPEndpoint):
    """Handles file deletion from the browser.

    Query Parameters:
        path: File path to delete (required)

    Returns:
        204: No content (success, including when file already absent)
        4xx/5xx: ``{"error": {"code": "...", "message": "..."}}``
    """

    async def delete(self, request: Request) -> Response:
        raise NotImplementedError("TODO: implement")
