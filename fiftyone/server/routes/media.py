"""
FiftyOne Server /media route

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import os
import stat

import anyio
from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request
from starlette.responses import FileResponse, Response


_MEDIA_HEADERS = {
    "Accept-Ranges": "bytes",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Range, Content-Type, Authorization",
    "Access-Control-Expose-Headers": (
        "Accept-Ranges, Content-Range, Content-Length"
    ),
}
MEDIA_FILE_RESPONSE_CHUNK_SIZE = 256 * 1024


def _media_headers(extra=None):
    headers = dict(_MEDIA_HEADERS)

    if extra:
        headers.update(extra)

    return headers


def _not_found_response():
    return Response(
        content="Not found",
        status_code=404,
        headers=_media_headers(),
    )


class MediaFileResponse(FileResponse):
    # Optimize local media serving for large range reads.
    chunk_size = MEDIA_FILE_RESPONSE_CHUNK_SIZE


class Media(HTTPEndpoint):
    async def get(self, request: Request) -> Response:
        # Note for HEAD: Starlette routes HEAD through GET when no HEAD handler exists.
        path = request.query_params.get("filepath")

        if not path:
            return Response(
                content="Missing required query parameter: filepath",
                status_code=400,
                headers=_media_headers(),
            )

        return await self._file_response(path)

    async def _file_response(self, path: str) -> Response:
        try:
            stat_result = await anyio.to_thread.run_sync(os.stat, path)
        except (FileNotFoundError, NotADirectoryError, PermissionError):
            return _not_found_response()
        except OSError as e:
            if e.errno in {errno.ENAMETOOLONG, errno.ELOOP}:
                return _not_found_response()
            raise

        if not stat.S_ISREG(stat_result.st_mode):
            return _not_found_response()

        return MediaFileResponse(
            path,
            stat_result=stat_result,
            headers=_media_headers(),
        )

    async def options(self, request: Request) -> Response:
        return Response(
            headers=_media_headers({"Allow": "OPTIONS, GET, HEAD"})
        )
