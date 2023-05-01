"""
| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import datetime

from typing import Optional, TypedDict, Union

from fiftyone.management import connection
from fiftyone.management import users
from fiftyone.management import util as fom_util


class ApiKey(TypedDict):
    """dict with information about a user"""

    id: str
    name: str
    created_at: datetime.datetime


_GENERATE_API_KEY_QUERY = """
    mutation($name: String!, $userId: String) {
      generateApiKey(
            name: $name
            userId: $userId
        ) { key }
    }
"""

_LIST_API_KEYS_QUERY = """
    query ($userId: String!) {
        user (id: $userId) {
            apiKeys {
                id
                name
                createdAt
            }
        }
    }
"""

_REMOVE_API_KEY_QUERY = """
    mutation($key: String!, $userId: String) {
      removeApiKey(
            keyId: $key
            userId: $userId
        )
    }
"""


def generate_api_key(
    key_name: str, user: Optional[Union[str, users.User]] = None
) -> str:
    """
    Generates an API key for the user.
        Calling user must be an admin, or generating
        an API key for their own user

    Args:
        key_name: Descriptive name of key
        user (None): User to generate API Key for.
            Either user ID or email as a string, or
            instance of :class:`fiftyone.management.User`.
            If None, will generate a key for calling user.

    Returns:
        API key as string
    """

    user_id = users._resolve_user_id(user, nullable=True)

    client = connection.ApiClientConnection().client
    data = client.post_graphql_request(
        query=_GENERATE_API_KEY_QUERY,
        variables={
            "name": key_name,
            "userId": user_id,
        },
    )
    return data["generateApiKey"]["key"]


def list_api_keys(user: Optional[Union[str, users.User]] = None):
    """
    Lists all api keys. Only contains name and ID, raw key is only
        available at time of generation.
        Calling user must be an admin or requesting keys for
        their own user.

    Args:
        user (None): User to list API Keys for.
            Either user ID or email as a string, or
            instance of :class:`fiftyone.management.User`.
            If None, will list keys for calling user.

    Returns:
        List[:class:`fiftyone.management.ApiKey`]
    """
    if user is None:
        user = users.whoami()
    user_id = users._resolve_user_id(user)

    client = connection.ApiClientConnection().client
    data = client.post_graphql_request(
        query=_LIST_API_KEYS_QUERY, variables={"userId": user_id}
    )
    return [
        {fom_util.camel_to_snake(var): val for var, val in api_key.items()}
        for api_key in data["user"]["apiKeys"]
    ]


def remove_api_key(
    key: str, user: Optional[Union[str, users.User]] = None
) -> None:
    """
    Removes API key for a user.
        Calling user must be an admin, or removing
        an API key from their own user

    Args:
        key: The key to remove
        user: User to remove API Key for.
            Either user ID or email as a string, or
            instance of :class:`fiftyone.management.User`
            If None, will attempt to remove a key from calling user.

    Returns:
        None
    """
    user_id = users._resolve_user_id(user, nullable=True)

    client = connection.ApiClientConnection().client
    client.post_graphql_request(
        query=_REMOVE_API_KEY_QUERY,
        variables={
            "key": key,
            "userId": user_id,
        },
    )
