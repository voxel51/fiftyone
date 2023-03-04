"""
FiftyOne Server decorators

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import traceback
import typing as t

from fiftyone.core.json import FiftyOneJSONEncoder, stringify

from starlette.endpoints import HTTPEndpoint
from starlette.responses import JSONResponse, Response
from starlette.requests import Request


class FiftyOneResponse(JSONResponse):
    def render(self, content: t.Any) -> bytes:
        return bytes(
            FiftyOneJSONEncoder.dumps(stringify(content)), encoding="utf-8"
        )


def route(func):
    async def wrapper(
        endpoint: HTTPEndpoint, request: Request, *args
    ) -> t.Union[dict, Response]:
        try:
            body = await request.body()
            payload = body.decode("utf-8")
            data = FiftyOneJSONEncoder.loads(payload) if payload else {}
            response = await func(endpoint, request, data, *args)
            if isinstance(response, Response):
                return response

            return FiftyOneResponse(response)
        except Exception as e:
            return FiftyOneResponse(
                {
                    "kind": "Server Error",
                    "stack": traceback.format_exc(),
                },
                status_code=500,
            )

    return wrapper
