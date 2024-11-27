"""
FiftyOne Api Requests

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import fnmatch
import os
import re
from typing import Optional

import aiohttp
from aiohttp.http_exceptions import InvalidHeader
import cachetools.func
from dateutil import parser as date_parser
import requests


from fiftyone.api import client as api_client
from fiftyone.internal.constants import TTL_CACHE_LIFETIME_SECONDS
from fiftyone.internal.util import (
    access_nested_element,
    is_internal_service,
    get_api_url,
    has_encryption_key,
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

_LIST_DATASETS_FOR_USER_QUERY = """
    query ($userId: String!, $search: DatasetSearchFieldsSearch, $after: String){
        user(id: $userId) {
            datasetsConnection(
                    first: 25,
                    after: $after,
                    search: $search,
                    order: {field: name}) {
                pageInfo {
                    hasNextPage
                    endCursor
                }
                edges {
                    node {
                        name
                        tags
                        createdAt
                        lastLoadedAt
                        mediaType
                    }
                }
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


async def make_request(url, access_token, query, variables=None, api_key=None):
    headers = _prepare_headers(access_token, api_key)
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


def make_sync_request(url, access_token, query, variables=None, api_key=None):
    headers = _prepare_headers(access_token, api_key)
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


def _get_key_or_token(access_token=None, api_key=None):
    # Explicit access token or api key passed
    if access_token or api_key:
        return api_key, access_token
    elif fo_context_vars.running_user_request_token.get():
        # Access token is in contextvars.Context
        return None, fo_context_vars.running_user_request_token.get()
    elif fo_context_vars.running_user_api_key.get():
        return fo_context_vars.running_user_api_key.get(), None

    # If no access token or API key is provided, we can try to authenticate with
    # a default API key, but the client must be configured as an internal
    # service with the encryption key set.
    # TODO: eventually replace with a service account token for
    #  internal authentication
    elif has_encryption_key() and os.getenv("FIFTYONE_API_KEY"):
        return os.getenv("FIFTYONE_API_KEY"), None

    return None, None


def _prepare_headers(access_token, api_key):
    headers = {
        "Content-Type": "application/json",
    }

    key, access_token = _get_key_or_token(
        access_token=access_token, api_key=api_key
    )
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
    api_key: Optional[str] = None,
) -> Optional[dict]:
    """
    Resolve a user asynchronously using the teams API.

    Args:
        id: the user ID
        dataset: the dataset ID
        token: the request token
        api_key: the api key

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
        api_key=api_key,
    )
    user = access_nested_element(result, access_nodes)
    return user


async def resolve_operation_user(
    id: Optional[str] = None,
    dataset: Optional[str] = None,
    token: Optional[str] = None,
    api_key: Optional[str] = None,
) -> Optional[dict]:
    """Resolve a user asynchronously using the teams API.
    Raise an exception if the user cannot be resolved when it is expected to
    be resolvable. Return None if the user cannot be resolved when it is not
    expected to be resolvable.
    """
    try:
        user = await resolve_user(
            id=id, dataset=dataset, token=token, api_key=api_key
        )
        if user:
            user.update({"_request_token": token, "_api_key": api_key})
        return user
    except Exception as e:
        if is_internal_service():
            raise ValueError("Failed to resolve user for the operation") from e
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
    """
    Create empty dataset on behalf of user, using the teams API.

    Args:
        dataset: the dataset name
        user_id: the user ID

    Returns:
        True if creation successful
    """
    key, token = _get_key_or_token()
    client = api_client.Client(_API_URL, key=key, token=token)
    result = client.post_graphql_request(
        _CREATE_DATASET_MUTATION,
        variables={"dataset": dataset, "userId": user_id},
    )
    return access_nested_element(result, ("createDataset", "name")) == dataset


def _format_list_datasets(dataset_docs_map, info):
    if info:
        return [
            {
                "name": result.get("name", None),
                "created_at": (
                    date_parser.parse(result["createdAt"])
                    if result.get("createdAt")
                    else None
                ),
                "last_loaded_at": (
                    date_parser.parse(result["lastLoadedAt"])
                    if result.get("lastLoadedAt")
                    else None
                ),
                "version": result.get("version", None),
                "persistent": True,
                "media_type": result.get("mediaType", None),
                "tags": result.get("tags", []),
            }
            for result in dataset_docs_map.values()
        ]
    else:
        return list(dataset_docs_map.keys())


def list_datasets_for_user(user_id, glob_patt=None, tags=None, info=False):
    """
    List datasets user has access to, using the teams API.

    Args:
        user_id: the user ID
        glob_patt (None): an optional glob pattern of names to return
        tags (None): only include datasets that have the specified tag or list
            of tags
        info (False): whether to return info dicts describing each dataset
            rather than just their names

    Returns:
        list of dataset names or list of dataset info dicts if info is True
    """
    key, token = _get_key_or_token()
    client = api_client.Client(_API_URL, key=key, token=token)

    results = []
    # If tags are set we have to search for each one separately and combine.
    if tags:
        if isinstance(tags, str):
            tags = [tags]

        for tag in tags:
            search = {"term": tag, "fields": "tags"}
            result = client.post_graphql_connectioned_request(
                _LIST_DATASETS_FOR_USER_QUERY,
                "user.datasetsConnection",
                variables={"userId": user_id, "search": search},
            )
            # API returns partial matches so make sure we have a full tag match
            result = list(filter(lambda result: tag in result["tags"], result))
            results += result

    # If glob_patt has [] in it, it can't be expressed in search terms.
    #   Just get all results and we'll filter later.
    elif glob_patt and "[" not in glob_patt:
        # Converts glob pattern into space-separated search terms.
        #   E.g., '?fifty?*one' becomes 'fifty one'
        modified_glob_patt = glob_patt.strip("*?").replace("?", "*")
        search_terms = modified_glob_patt.split("*")
        search_terms = " ".join(filter(bool, search_terms))

        # Execute query with search terms on name
        search = {"term": search_terms, "fields": "name"}
        results = client.post_graphql_connectioned_request(
            _LIST_DATASETS_FOR_USER_QUERY,
            "user.datasetsConnection",
            variables={"userId": user_id, "search": search},
        )
    else:
        results = client.post_graphql_connectioned_request(
            _LIST_DATASETS_FOR_USER_QUERY,
            "user.datasetsConnection",
            variables={"userId": user_id},
        )

    # No matter how we got results above, redo the glob_patt match to make sure
    #   they all match
    if glob_patt:
        matcher = re.compile(fnmatch.translate(glob_patt))
        results = list(
            filter(lambda result: matcher.fullmatch(result["name"]), results)
        )

    # Dedupe results on name
    deduped_results = {result["name"]: result for result in results}

    return _format_list_datasets(deduped_results, info=info)
