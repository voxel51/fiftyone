"""
FiftyOne Api Requests

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os

import aiohttp
from aiohttp.http_exceptions import InvalidHeader

from fiftyone.internal.util import is_internal_service


async def make_request(url, access_token, query, variables=None):
    headers = {
        "Content-Type": "application/json",
    }
    if access_token:
        headers["Authorization"] = access_token
    else:
        # if no access token is provided, but running as an internal service,
        # use an API key (TODO: replace with a service account token for
        #  internal authentication?)
        if is_internal_service() and os.getenv("FIFTYONE_API_KEY"):
            headers["X-API-Key"] = os.getenv("FIFTYONE_API_KEY")
        else:
            raise InvalidHeader(
                f"No access token provided and not running as an internal "
                f"service. Cannot complete request.\nquery={query}"
            )
    async with aiohttp.ClientSession() as session:
        async with session.post(
            url, headers=headers, json={"query": query, "variables": variables}
        ) as resp:
            if resp.status == 200:
                result = await resp.json()
                if "errors" in result:
                    for error in result["errors"]:
                        print(error)
                    raise Exception(f"Query failed with errors. {query}")
                return result
            else:
                raise Exception(
                    f"Query failed to run by returning code of "
                    f"{resp.status}. {query}"
                )
