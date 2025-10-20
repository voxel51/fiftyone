"""
FiftyOne Server decorators

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import traceback
import typing as t
import logging

<<<<<<< HEAD
=======
from bson import json_util
>>>>>>> main
from starlette.endpoints import HTTPEndpoint
from starlette.exceptions import HTTPException
from starlette.responses import JSONResponse, Response
from starlette.requests import Request

<<<<<<< HEAD
from fiftyone.core.utils import run_sync_task
from fiftyone.server import utils


async def create_response(response: dict):
    """Creates a JSON response from the given dictionary."""
    return Response(
        await run_sync_task(lambda: utils.json.dumps(response)),
        headers={"Content-Type": "application/json"},
    )
=======
from fiftyone.core.utils import create_response
>>>>>>> main


def route(func):
    """A decorator for HTTPEndpoint methods that parses JSON request bodies
    and handles exceptions."""

    async def wrapper(
        endpoint: HTTPEndpoint, request: Request, *args
    ) -> t.Union[dict, Response]:
        try:
            body = await request.body()
            payload = body.decode("utf-8")
            data = utils.json.loads(payload)
            response = await func(endpoint, request, data, *args)
            if isinstance(response, Response):
                return response

            return await create_response(response)

        except Exception as e:
            # Immediately re-raise starlette HTTP exceptions
            if isinstance(e, HTTPException):
                raise e

            # Cast non-starlette HTTP exceptions as JSON with 500 status code
            logging.exception(e)
            return JSONResponse(
                {
                    "kind": "Server Error",
                    "stack": traceback.format_exc(),
                },
                status_code=500,
            )

    return wrapper
