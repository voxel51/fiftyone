"""
API key management.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import dataclasses
import datetime
from typing import Optional, TypedDict, Union

from fiftyone.management import connection
from fiftyone.management import users
from fiftyone.management import util as fom_util


@dataclasses.dataclass
class APIKey(object):
    """API key dataclass."""

    id: str
    name: str
    created_at: datetime.datetime

    def __post_init__(self):
        if isinstance(self.created_at, str):
            self.created_at = datetime.datetime.fromisoformat(self.created_at)


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

_GENERATE_API_KEY_QUERY = """
    mutation($name: String!, $userId: String) {
      generateApiKey(
            name: $name
            userId: $userId
        ) { key }
    }
"""

_DELETE_API_KEY_QUERY = """
    mutation($key: String!, $userId: String) {
      removeApiKey(
            keyId: $key
            userId: $userId
        )
    }
"""


def delete_api_key(
    key: str, user: Optional[Union[str, users.User]] = None
) -> None:
    """Deletes the API key for the given user (default: current user).

    .. note::

        Only admins can delete keys for other users.

    Examples::

        import fiftyone.management as fom

        # Delete all keys from a user
        email = "user@company.com"
        for key in fom.list_api_keys(email):
            fom.delete_api_key(key.id, email)

    Args:
        key: the ID of the key to delete
        user (None): an optional user ID, email string, or
            :class:`~fiftyone.management.users.User` instance. Defaults to
            the current user.
    """
    user_id = users.resolve_user_id(user, nullable=True)

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

    .. note::

        Only admins can generate keys for other users.

    .. warning::

        Once generated, this key cannot be recovered! If it's lost,
        you must generate a new key.

    Examples::

        import fiftyone.management as fom

        # 1. Generate key for myself
        fom.generate_api_key("my-key")

        # 2.a Generate key for user@example.com
        fom.generate_api_key("your-key", "user@example.com")

        # 2.b Generate key for user@example.com
        user = fom.get_user("user@example.com")
        fom.generate_api_key("your-key", user)

    Args:
        key_name: a descriptive name for the key
        user (None): an optional user ID, email string, or
            :class:`~fiftyone.management.users.User` instance. Defaults
            to the current user.

    Returns:
        the API key string
    """
    user_id = users.resolve_user_id(user, nullable=True)

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

    .. note::

        Only admins can request keys for other users.

    Examples::

        import fiftyone.management as fom

        # 1. List my keys
        fom.list_api_keys() # list my keys

        # 2.a List keys for user@example.com
        fom.list_api_keys("user@example.com")

        # 2.b List keys for user@example.com
        user = fom.get_user("user@example.com")
        fom.list_api_keys(user)

    Args:
        user (None): an optional user ID, email string, or
            :class:`~fiftyone.management.users.User` instance. Defaults
            to the current user.

    Returns:
        a list of :class:`APIKey` instances
    """
    if user is None:
        user = users.whoami()
    user_id = users.resolve_user_id(user)

    client = connection.APIClientConnection().client
    data = client.post_graphql_request(
        query=_LIST_API_KEYS_QUERY, variables={"userId": user_id}
    )
    return [
        APIKey(**fom_util.camel_to_snake_container(api_key))
        for api_key in data["user"]["apiKeys"]
    ]
