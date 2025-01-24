"""
FiftyOne Server /media route

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os
import typing as t

import anyio
import aiofiles
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
        path = request.query_params["filepath"]

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
        path = request.query_params["filepath"]
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
