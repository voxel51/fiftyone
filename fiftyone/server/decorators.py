"""
FiftyOne Server decorators

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import traceback
import typing as t
import logging
from functools import wraps

from starlette.endpoints import HTTPEndpoint
from starlette.exceptions import HTTPException
from starlette.responses import JSONResponse, Response
from starlette.requests import Request

from fiftyone.core.utils import create_response
from fiftyone.server import utils
from fiftyone.server.exceptions import DbVersionMismatchError


_BODY_METHOD_NAMES = {"post", "put", "patch"}


def route(func=None, *, parse_body: t.Optional[bool] = None):
    """A decorator for HTTPEndpoint methods that handles exceptions.

    By default, POST, PUT, and PATCH handlers parse the JSON body and receive
    the parsed data as the third handler argument. Other handlers skip body
    parsing. This behavior can be explicitly overridden with ``parse_body``.
    """

    def decorator(func):
        should_parse_body = (
            func.__name__.lower() in _BODY_METHOD_NAMES
            if parse_body is None
            else parse_body
        )

        @wraps(func)
        async def wrapper(
            endpoint: HTTPEndpoint, request: Request, *args
        ) -> t.Union[dict, Response]:
            try:
                if should_parse_body:
                    body = await request.body()
                    payload = body.decode("utf-8")
                    data = utils.json.loads(payload)
                    response = await func(endpoint, request, data, *args)
                else:
                    response = await func(endpoint, request, *args)

                if isinstance(response, Response):
                    return response

                return await create_response(response)

            except Exception as e:
                # Immediately re-raise starlette HTTP exceptions
                if isinstance(e, HTTPException):
                    raise e

                if isinstance(e, DbVersionMismatchError):
                    return utils.json.JSONResponse(
                        utils.json.serialize(e.sample),
                        status_code=412,
                        headers={"ETag": e.etag},
                    )

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

    if func is None:
        return decorator

    return decorator(func)
