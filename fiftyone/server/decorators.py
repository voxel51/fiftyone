"""
FiftyOne Server decorators

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from json import JSONEncoder
import traceback
import typing as t
import logging

from bson import json_util
import numpy as np

from fiftyone.core.utils import run_sync_task

from starlette.endpoints import HTTPEndpoint
from starlette.responses import JSONResponse, Response
from starlette.requests import Request


class Encoder(JSONEncoder):
    def default(self, o):
        if isinstance(o, np.floating):
            return float(o)

        if isinstance(o, np.integer):
            return int(o)

        return JSONEncoder.default(self, o)


async def create_response(response: dict):
    return Response(
        await run_sync_task(lambda: json_util.dumps(response, cls=Encoder)),
        headers={"Content-Type": "application/json"},
    )


def route(func):
    async def wrapper(
        endpoint: HTTPEndpoint, request: Request, *args
    ) -> t.Union[dict, Response]:
        try:
            body = await request.body()
            payload = body.decode("utf-8")
            data = json_util.loads(payload) if payload else {}
            response = await func(endpoint, request, data, *args)
            if isinstance(response, Response):
                return response

            return await create_response(response)

        except Exception as e:
            logging.exception(e)
            return JSONResponse(
                {
                    "kind": "Server Error",
                    "stack": traceback.format_exc(),
                },
                status_code=500,
            )

    return wrapper
