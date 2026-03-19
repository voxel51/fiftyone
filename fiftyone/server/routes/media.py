"""
FiftyOne Server /media route

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import mimetypes
import os
import typing as t
from pathlib import Path

import anyio
import aiofiles
import eta.core.image as etai
import eta.core.video as etav
from aiofiles.threadpool.binary import AsyncBufferedReader
from aiofiles.os import stat as aio_stat
from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request
from starlette.responses import (
    FileResponse,
    Response,
    StreamingResponse,
    guess_type,
)

from fiftyone.server.media_cache import is_path_allowed

# @todo: migrate to eta with proper is_*_mime_type() detection methods
for _mime, _ext in (
    ("application/x-pcd", ".pcd"),
    ("application/x-fo3d", ".fo3d"),
    ("application/x-rrd", ".rrd"),
    ("application/x-npy", ".npy"),
):
    mimetypes.add_type(_mime, _ext)

# Non-media MIME types blocked on the /media endpoint only
_BLOCKED_MIME_PREFIXES = ("text/",)
_BLOCKED_MIME_TYPES = frozenset(
    {
        "application/json",
        "application/xml",
        "application/javascript",
    }
)


def _is_media_file(filepath: str) -> bool:
    """Checks whether a filepath has a recognized media MIME type.

    Uses ``eta.core`` for image/video detection, then falls back to
    ``mimetypes.guess_type``. Files with unrecognized extensions (None
    MIME) are allowed through to the directory allowlist check.
    """
    if etai.is_image_mime_type(filepath):
        return True

    if etav.is_video_mime_type(filepath):
        return True

    mime_type, _ = mimetypes.guess_type(filepath)
    if mime_type is None:
        return True

    if mime_type.startswith(_BLOCKED_MIME_PREFIXES):
        return False

    return mime_type not in _BLOCKED_MIME_TYPES


def _validate_media_path(
    request: Request,
) -> tuple[str | None, Response | None]:
    """Validates and normalizes the requested media path.

    Applies three layers of defense:

    1. **Path normalization** — expands ``~``, resolves ``..`` and
       symlinks via ``pathlib.Path.expanduser().resolve()``.
    2. **Media type check** — rejects files with known non-media MIME
       types (``text/*``, ``application/json``, etc.) on this endpoint.
    3. **Directory allowlist** — rejects files outside directories that
       have been registered by dataset media resolution or server config.

    Args:
        request: a Starlette ``Request``

    Returns:
        a ``(resolved_path, None)`` tuple on success, or
        ``(None, error_response)`` on failure
    """
    raw_path = request.query_params.get("filepath")
    if not raw_path:
        return None, Response(status_code=400)

    resolved = Path(raw_path).expanduser().resolve(strict=False)
    resolved_str = str(resolved)

    if not _is_media_file(resolved_str):
        return None, Response(status_code=403)

    if not is_path_allowed(resolved_str):
        return None, Response(status_code=403)

    return resolved_str, None


async def ranged(
    file: AsyncBufferedReader,
    start: int = 0,
    end: int = None,
    block_size: int = 8192,
) -> t.AsyncGenerator:
    consumed = 0

    await file.seek(start)

    while True:
        data_length = (
            min(block_size, end - start - consumed) if end else block_size
        )

        if data_length <= 0:
            break

        data = await file.read(data_length)

        if not data:
            break

        consumed += data_length

        yield data

    if hasattr(file, "close"):
        await file.close()


class Media(HTTPEndpoint):
    async def get(
        self, request: Request
    ) -> t.Union[FileResponse, StreamingResponse]:
        path, error = _validate_media_path(request)
        if error:
            return error

        response: t.Union[FileResponse, StreamingResponse]

        try:
            await anyio.to_thread.run_sync(os.stat, path)
        except FileNotFoundError:
            return Response(content="Not found", status_code=404)

        if request.headers.get("range"):
            response = await self.ranged_file_response(path, request)
        else:
            response = FileResponse(
                path,
            )
        response.headers["Accept-Ranges"] = "bytes"

        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, HEAD, OPTIONS"
        response.headers[
            "Access-Control-Allow-Headers"
        ] = "Range, Content-Type, Authorization"
        response.headers[
            "Access-Control-Expose-Headers"
        ] = "Accept-Ranges, Content-Range, Content-Length"
        return response

    async def ranged_file_response(
        self, path: str, request: Request
    ) -> StreamingResponse:
        file = await aiofiles.open(path, "rb")
        file_size = (await aio_stat(path)).st_size
        content_range = request.headers.get("range")
        content_length = file_size
        status_code = 200
        headers = {}

        if content_range is not None:
            content_range = content_range.strip().lower()

            content_ranges = content_range.split("=")[-1]

            range_start, range_end, *_ = map(
                str.strip, (content_ranges + "-").split("-")
            )

            start, end = (
                int(range_start) if range_start else 0,
                int(range_end) if range_end else file_size - 1,
            )
            range_start = max(0, start)
            range_end = min(file_size - 1, int(end))

            content_length = (end - start) + 1

            file_response = ranged(file, start=start, end=end + 1)

            status_code = 206

            headers["Content-Range"] = f"bytes {start}-{end}/{file_size}"

        response = StreamingResponse(
            file_response,
            media_type=guess_type(path)[0],
            status_code=status_code,
        )

        response.headers.update(
            {
                "Accept-Ranges": "bytes",
                "Content-Length": str(content_length),
                **headers,
            }
        )

        return response

    async def head(self, request: Request) -> Response:
        path, error = _validate_media_path(request)
        if error:
            return error

        response = Response()
        size = (await aio_stat(path)).st_size
        response.headers.update(
            {
                "Accept-Ranges": "bytes",
                "Content-Type": guess_type(path)[0],
                "Content-Length": size,
            }
        )
        return response

    async def options(self, request: Request) -> Response:
        response = Response()
        response.headers["Accept-Ranges"] = "bytes"
        response.headers["Allow"] = "OPTIONS, GET, HEAD"
        return response
