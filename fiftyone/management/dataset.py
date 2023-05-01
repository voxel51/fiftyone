"""
Dataset management.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import enum
from typing import Dict, List, Union

from fiftyone.management import connection
from fiftyone.management import users


class DatasetPermission(enum.Enum):
    """Dataset permission enum."""

    NO_ACCESS = "NO_ACCESS"
    VIEW = "VIEW"
    COMMENT = "COMMENT"
    EDIT = "EDIT"
    MANAGE = "MANAGE"


_GET_PERMISSIONS_FOR_DATASET_QUERY = """
    query ($dataset: String!){
        dataset(identifier: $dataset) {
            users(first: 10000) {
                activePermission
                user {name, id}
            }
        }
    }
"""

_GET_PERMISSIONS_FOR_DATASET_USER_QUERY = """
    query ($dataset: String!, $userId: String!){
        dataset(identifier: $dataset) {
            user(id: $userId) {
                activePermission
            }
        }
    }
"""

_GET_PERMISSIONS_FOR_USER_QUERY = """
    query ($userId: String!, $after: String){
        datasetsConnection(first: 25, after: $after, 
            order: {field: name}) {
            pageInfo {
                hasNextPage
                endCursor
            }
            edges {
                node {
                    name
                    user(id: $userId) {
                        activePermission
                    }
                }
            }
        }
    }
"""

_SET_DATASET_DEFAULT_PERM_QUERY = """
    mutation($identifier: String!, $permission: DatasetPermission!) {
        setDatasetDefaultPermission(
            datasetIdentifier: $identifier
            permission: $permission
        ) { id }
    }
"""

_SET_DATASET_USER_PERM_QUERY = """
    mutation(
        $identifier: String!,
        $userId: String!,
        $permission: DatasetPermission!
    ) {
      setDatasetUserPermission(
            datasetIdentifier: $identifier
            userId: $userId
            permission: $permission
        ) { id }
    }
"""

_REMOVE_DATASET_USER_PERM_QUERY = """
    mutation($identifier: String!, $userId: String!) {
      removeDatasetUserPermission(
            datasetIdentifier: $identifier
            userId: $userId
        ) { id }
    }
"""


def get_permissions(*, dataset_name: str = None, user: str = None):
    """Gets the specified dataset or user permissions.

    This method is a convenience wrapper around the methods below based on
    which arguments you provide:

    -   ``dataset_name``: :func:`get_permissions_for_dataset`
    -   ``user``: :func:`get_permissions_for_user`
    -   ``dataset_name`` and ``user``: :func:`get_permissions_for_dataset_user`

    .. note::

        Only admins can retrieve this information.

    Args:
        dataset_name (None): a dataset name
        user (None): a user ID, email string, or
            :class:`fiftyone.management.User` instance

    Returns:
        the requested user/dataset permissions
    """
    if dataset_name is None and user is None:
        raise ValueError("Must specify one or both of dataset or user")
    elif dataset_name is None:
        return get_permissions_for_user(user)
    elif user is None:
        return get_permissions_for_dataset(dataset_name)
    else:
        return get_permissions_for_dataset_user(dataset_name, user)


def get_permissions_for_dataset(dataset_name: str) -> List[Dict]:
    """Gets the list of users that have access to the given dataset.

    .. note::

        Only admins can retrieve this information.

    Example output::

        [
            {'name': 'A. User', 'id': '12345', 'permission': 'MANAGE},
            {'name': 'B. User', 'id': '67890', 'permission': 'EDIT'},
        ]

    Args:
        dataset_name: the dataset name

    Returns:
        a list of user info dicts
    """
    client = connection.APIClientConnection().client
    result = client.post_graphql_request(
        query=_GET_PERMISSIONS_FOR_DATASET_QUERY,
        variables={"dataset": dataset_name},
    )

    if result["dataset"] is None:
        raise ValueError(f"Dataset not found: {dataset_name}")

    return [
        {
            "name": user["user"]["name"],
            "id": user["user"]["id"],
            "permission": user["activePermission"],
        }
        for user in result["dataset"]["users"]
    ]


def get_permissions_for_dataset_user(
    dataset_name: str, user: str
) -> DatasetPermission:
    """Gets the access permission (if any) that a given user has to a given
    dataset.

    .. note::

        Only admins can retrieve this information.

    Args:
        dataset_name: the dataset name
        user: a user ID, email string, or :class:`fiftyone.management.User`
            instance

    Returns:
        :class:`DatasetPermission`
    """
    user_id = users._resolve_user_id(user)
    client = connection.APIClientConnection().client
    result = client.post_graphql_request(
        query=_GET_PERMISSIONS_FOR_DATASET_USER_QUERY,
        variables={"userId": user_id, "dataset": dataset_name},
    )
    if result["dataset"] is None:
        raise ValueError(f"Dataset not found: {dataset_name}")

    dataset_user = result["dataset"]["user"]
    if dataset_user is None:
        return DatasetPermission.NO_ACCESS
    else:
        return DatasetPermission[dataset_user["activePermission"]]


def get_permissions_for_user(user: str):
    """Gets a list of datasets a given user has access to.

    .. note::

        Only admins can retrieve this information.

    Example output::

        [
            {'name': 'A. User', 'id': '12345', 'permission': 'MANAGE},
            {'name': 'B. User', 'id': '67890', 'permission': 'EDIT'},
        ]

    Args:
        user: a user ID, email string, or :class:`fiftyone.management.User`
            instance

    Returns:
        a list of permission dicts
    """
    user_id = users._resolve_user_id(user)

    client = connection.APIClientConnection().client
    dataset_permissions = client.post_graphql_connectioned_request(
        query=_GET_PERMISSIONS_FOR_USER_QUERY,
        variables={"userId": user_id},
        connection_property="datasetsConnection",
    )
    return [
        {
            "name": ds_perm["name"],
            "permission": ds_perm["user"]["activePermission"],
        }
        for ds_perm in dataset_permissions
        if ds_perm["user"] is not None
    ]


def set_dataset_default_permission(
    dataset_name: str, permission: DatasetPermission
) -> None:
    """Sets the default member access level for the given dataset.

    .. note::

        The caller must have ``Can Manage`` permissions on the dataset.

    Args:
        dataset_name: the dataset name
        permission: the :class:`fiftyone.management.DatasetPermission` to set
    """
    client = connection.APIClientConnection().client
    client.post_graphql_request(
        query=_SET_DATASET_DEFAULT_PERM_QUERY,
        variables={"identifier": dataset_name, "permission": permission.value},
    )


def set_dataset_user_permission(
    dataset_name: str,
    user: Union[str, users.User],
    permission: DatasetPermission,
) -> None:
    """Grants the given user specific access to the given dataset at the
    specified permission level.

    .. note::

        The caller must have ``Can Manage`` permissions on the dataset.

    Args:
        dataset_name: the dataset name
        user: a user ID, email string, or :class:`fiftyone.management.User`
            instance
        permission: the :class:`fiftyone.management.DatasetPermission` to grant
    """
    user_id = users._resolve_user_id(user)

    client = connection.APIClientConnection().client
    client.post_graphql_request(
        query=_SET_DATASET_USER_PERM_QUERY,
        variables={
            "identifier": dataset_name,
            "userId": user_id,
            "permission": permission.value,
        },
    )


def remove_dataset_user_permission(
    dataset_name: str, user: Union[str, users.User]
) -> None:
    """Removes the given user's specific access to the given dataset.

    .. note::

        The caller must have ``Can Manage`` permissions on the dataset.

    Args:
        dataset_name: the dataset name
        user: a user ID, email string, or :class:`fiftyone.management.User`
            instance
    """
    user_id = users._resolve_user_id(user)

    client = connection.APIClientConnection().client
    client.post_graphql_request(
        query=_REMOVE_DATASET_USER_PERM_QUERY,
        variables={
            "identifier": dataset_name,
            "userId": user_id,
        },
    )
