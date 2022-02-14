"""
FiftyOne Server decorators.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import traceback
import typing as t

from starlette.responses import Response
from starlette.requests import Request

from fiftyone.server.json_util import FiftyOneJSONEncoder, FiftyOneResponse


def route(func):
    async def wrapper(request: Request) -> t.Union[dict, Response]:
        try:
            data = FiftyOneJSONEncoder.loads(await request.body)
            result = await func(request, data)
            if isinstance(result, Response):
                return result

            return FiftyOneResponse(result)
        except Exception:
            return FiftyOneResponse(
                {"kind": "Server Error", "stack": traceback.format_exc(),}
            )

    return wrapper
