"""
FiftyOne Server decorators

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import traceback
import typing as t
import logging

from bson import json_util

from fiftyone.core.utils import run_sync_task

from starlette.endpoints import HTTPEndpoint
from starlette.responses import JSONResponse, Response
from starlette.requests import Request


async def load_variables(request: Request):
    body = await request.body()
    payload = body.decode("utf-8")
    return json_util.loads(payload) if payload else {}


def route(func):
    async def wrapper(
        endpoint: HTTPEndpoint, request: Request, variables=None
    ) -> t.Union[dict, Response]:
        try:
            if variables is None:
                variables = await load_variables(request)

            response = await func(endpoint, request, variables)
            if isinstance(response, Response):
                return response

            return Response(
                await run_sync_task(lambda: json_util.dumps(response))
            )
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
