"""
FiftyOne Api Requests

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os
from typing import Optional

import aiohttp
import cachetools.func
import requests
from aiohttp.http_exceptions import InvalidHeader

from fiftyone.api import client as api_client
from fiftyone.internal.constants import TTL_CACHE_LIFETIME_SECONDS
from fiftyone.internal.util import (
    access_nested_element,
    get_api_url,
    has_encryption_key,
    has_api_key,
)
from fiftyone.internal import context_vars as fo_context_vars
from fiftyone.utils.decorators import async_ttl_cache


_API_URL = get_api_url()

_CREATE_DATASET_MUTATION = """
mutation CreateDatasetMutation($dataset: String!, $userId: String!) {
  createDataset(name: $dataset, onBehalfOfUserId: $userId) {
    name
  }
}
"""

_DATASET_USER_PERMISSION_QUERY = """
query DatasetUserPermissionQuery($dataset: String!, $userId: String!) {
  dataset(identifier: $dataset) {
    user(id: $userId) {
      activePermission
    }
  }
}
"""

_DATASET_USER_QUERY = """
query DatasetUserQuery($dataset: String!, $userId: String!) {
  dataset(identifier: $dataset) {
    user(id: $userId) {
      dataset_permission: activePermission
      email
      id
      name
      role
    }
  }
}
"""

_DATASET_VIEWER_QUERY = """
query ViewerQuery($dataset: String!) {
  dataset(identifier: $dataset) {
    viewer {
      dataset_permission: activePermission
      email
      id
      name
      role
    }
  }
}
"""

_USER_QUERY = """
query DatasetUserQuery($userId: String!) {
  user(id: $userId) {
    email
    id
    name
    role
  }
}
"""

_VIEWER_QUERY = """
query ViewerQuery {
  viewer {
    email
    id
    name
    role
  }
}
"""


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


def _get_key_or_token(access_token=None):
    if access_token:
        # Explicit access token passed
        return None, access_token
    elif fo_context_vars.running_user_request_token.get():
        # Access token is in contextvars.Context
        return None, fo_context_vars.running_user_request_token.get()

    # If no access token is provided, we can try to authenticate with
    # an api key, but the client must be configured as an internal
    # service with the encryption key set.
    # TODO: eventually replace with a service account token for
    #  internal authentication
    elif has_encryption_key() and os.getenv("FIFTYONE_API_KEY"):
        return os.getenv("FIFTYONE_API_KEY"), None

    return None, None


def _prepare_headers(access_token):
    headers = {
        "Content-Type": "application/json",
    }

    key, access_token = _get_key_or_token(access_token)
    if access_token:
        headers["Authorization"] = access_token
    elif key:
        headers["X-API-Key"] = key
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
            f"Query failed with errors.\n query={query}\nvariables={variables}"
        )
    return result


@async_ttl_cache(ttl=TTL_CACHE_LIFETIME_SECONDS)
async def resolve_user(
    id: Optional[str] = None,
    dataset: Optional[str] = None,
    token: Optional[str] = None,
) -> Optional[dict]:
    """
    Resolve a user asynchronously using the teams API.

    Args:
        id: the user ID
        dataset: the dataset ID
        token: the request token

    Returns:
        the user
    """
    variables = {}
    access_nodes = ["data"]
    if dataset is not None:
        variables["dataset"] = dataset
        access_nodes.append("dataset")
    if id is not None:
        query = _DATASET_USER_QUERY if dataset else _USER_QUERY
        variables["userId"] = id
        access_nodes.append("user")
    else:
        query = _DATASET_VIEWER_QUERY if dataset else _VIEWER_QUERY
        access_nodes.append("viewer")

    result = await make_request(
        f"{_API_URL}/graphql/v1",
        token,  # FIFTYONE_API_KEY will be used if token is None
        query,
        variables=variables,
    )
    user = access_nested_element(result, access_nodes)
    return user


async def resolve_operation_user(
    id: Optional[str] = None,
    dataset: Optional[str] = None,
    token: Optional[str] = None,
) -> Optional[dict]:
    """Resolve a user asynchronously using the teams API.
    Raise an exception if the user cannot be resolved when it is expected to
    be resolvable. Return None if the user cannot be resolved when it is not
    expected to be resolvable.
    """
    try:
        user = await resolve_user(id=id, dataset=dataset, token=token)
        if user:
            user.update({"_request_token": token})
        return user
    except Exception:
        if (token is not None) or has_api_key():
            raise ValueError("Failed to resolve user for the operation")
        return None


@cachetools.func.ttl_cache(ttl=TTL_CACHE_LIFETIME_SECONDS)
def get_dataset_permissions_for_user(dataset, user_id):
    """
    Get permissions user has to a dataset, using the teams API.

    Args:
        dataset: the dataset ID or name
        user_id: the user ID

    Returns:
        :class:`DatasetPermission`
    """
    key, token = _get_key_or_token()
    client = api_client.Client(_API_URL, key=key, token=token)
    result = client.post_graphql_request(
        _DATASET_USER_PERMISSION_QUERY,
        variables={"dataset": dataset, "userId": user_id},
    )

    return access_nested_element(
        result, ("dataset", "user", "activePermission")
    )


def create_dataset_with_user_permissions(dataset, user_id):
    key, token = _get_key_or_token()
    client = api_client.Client(_API_URL, key=key, token=token)
    result = client.post_graphql_request(
        _CREATE_DATASET_MUTATION,
        variables={"dataset": dataset, "userId": user_id},
    )
    return access_nested_element(result, ("createDataset", "name")) == dataset
