"""
FiftyOne Api Requests

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os

import aiohttp
import requests
from aiohttp.http_exceptions import InvalidHeader

from fiftyone.internal.util import has_encryption_key, is_internal_service


async def make_request(url, access_token, query, variables=None):
    headers = _prepare_headers(access_token)
    async with aiohttp.ClientSession() as session:
        async with session.post(
            url, headers=headers, json={"query": query, "variables": variables}
        ) as resp:
            if resp.status == 200:
                result = await resp.json()
                return _handle_result(result, query, variables=variables)
            else:
                raise Exception(
                    f"`make_request()` failed to run by returning code of "
                    f"{resp.status}. \nquery={query}\nvariables={variables}"
                )


def make_sync_request(url, access_token, query, variables=None):
    headers = _prepare_headers(access_token)
    resp = requests.post(
        url, headers=headers, json={"query": query, "variables": variables}
    )
    if resp.status_code == 200:
        return _handle_result(resp.json(), query, variables)
    else:
        raise Exception(
            f"`make_sync_request()` failed to run by returning code of "
            f"{resp.status_code}. \nquery={query}\nvariables={variables}"
        )


def _prepare_headers(access_token):
    headers = {
        "Content-Type": "application/json",
    }
    if access_token:
        headers["Authorization"] = access_token
    else:
        # If no access token is provided, we can try to authenticate with
        # an api key, but the client must be configured as an internal
        # service with the encryption key set.
        # TODO: eventually replace with a service account token for
        #  internal authentication
        if has_encryption_key() and os.getenv("FIFTYONE_API_KEY"):
            headers["X-API-Key"] = os.getenv("FIFTYONE_API_KEY")
        else:
            raise InvalidHeader(
                f"No access token provided and not running as an internal "
                f"service. Cannot complete request."
            )
    return headers


def _handle_result(result, query, variables=None):
    if "errors" in result:
        for error in result["errors"]:
            print(error)
        raise Exception(
            f"Query failed with errors.\n query={query}\nvairables={variables}"
        )
    return result
