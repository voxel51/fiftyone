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

import fiftyone.server.files as fsf


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
        path = request.query_params.get("path")

        try:
            resolved_path = await fsf.stream_upload(
                stream=request.stream(),
                path=path,
            )
            return JSONResponse({"path": resolved_path}, status_code=201)

        except fsf.FileOperationError as e:
            return JSONResponse(e.to_dict(), status_code=e.status_code)


class FileDelete(HTTPEndpoint):
    """Handles file deletion from the browser.

    Query Parameters:
        path: File path to delete (required)

    Returns:
        204: No content (success, including when file already absent)
        4xx/5xx: ``{"error": {"code": "...", "message": "..."}}``
    """

    async def delete(self, request: Request) -> Response:
        path = request.query_params.get("path")

        try:
            await fsf.delete_file(path=path)
            return Response(status_code=204)

        except fsf.FileOperationError as e:
            return JSONResponse(e.to_dict(), status_code=e.status_code)
