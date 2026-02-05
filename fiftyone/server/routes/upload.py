"""
FiftyOne upload route.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse


class Upload(HTTPEndpoint):
    """Handles file uploads from the browser."""

    async def post(self, request: Request) -> JSONResponse:
        """Upload a file."""
        raise NotImplementedError("TODO: implement")
