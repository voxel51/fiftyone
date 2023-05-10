"""
API key management.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import datetime

from typing import Optional, TypedDict, Union

from fiftyone.management import connection
from fiftyone.management import users
from fiftyone.management import util as fom_util


class APIKey(TypedDict):
    """dict with information about a user"""

    id: str
    name: str
    created_at: datetime.datetime


_DELETE_API_KEY_QUERY = """
    mutation($key: String!, $userId: String) {
      removeApiKey(
            keyId: $key
            userId: $userId
        )
    }
"""


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


def delete_api_key(
    key: str, user: Optional[Union[str, users.User]] = None
) -> None:
    """Deletes the API key for the given user (default: current user).

    .. note:

        Only admins can delete keys for other users.

    Args:
        key: the key to delete
        user (None): an optional user ID, email string, or
            :class:`fiftyone.management.User` instance. Defaults to the current
            user
    """
    user_id = users._resolve_user_id(user, nullable=True)

    client = connection.APIClientConnection().client
    client.post_graphql_request(
        query=_DELETE_API_KEY_QUERY,
        variables={
            "key": key,
            "userId": user_id,
        },
    )


def generate_api_key(
    key_name: str, user: Optional[Union[str, users.User]] = None
) -> str:
    """Generates an API key for the given user (default: current user).

    .. note:

        Only admins can generate keys for other users.

    Args:
        key_name: a descriptive name for the key
        user (None): an optional user ID, email string, or
            :class:`fiftyone.management.User` instance. Defaults to the current
            user

    Returns:
        the API key string
    """
    user_id = users._resolve_user_id(user, nullable=True)

    client = connection.APIClientConnection().client
    data = client.post_graphql_request(
        query=_GENERATE_API_KEY_QUERY,
        variables={
            "name": key_name,
            "userId": user_id,
        },
    )
    return data["generateApiKey"]["key"]


def list_api_keys(user: Optional[Union[str, users.User]] = None):
    """Lists all API keys for the given user (default: current user).

    The returned key objects only have their name and IDs populated; the raw
    key is only available at time of generation.

    .. note:

        Only admins can request keys for other users.

    Args:
        user (None): an optional user ID, email string, or
            :class:`fiftyone.management.User` instance. Defaults to the current
            user

    Returns:
        a list of :class:`APIKey` instances
    """
    if user is None:
        user = users.whoami()
    user_id = users._resolve_user_id(user)

    client = connection.APIClientConnection().client
    data = client.post_graphql_request(
        query=_LIST_API_KEYS_QUERY, variables={"userId": user_id}
    )
    return [
        {fom_util.camel_to_snake(var): val for var, val in api_key.items()}
        for api_key in data["user"]["apiKeys"]
    ]
