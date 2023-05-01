"""
| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import enum
from typing import Dict, List, Union

from fiftyone.management import connection
from fiftyone.management import users


class DatasetPermission(enum.Enum):
    """Dataset permission enum"""

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
    """
    Convenience wrapper around get_permissions* functions. See
        corresponding functions for their documentation. If you
        pass in a parameter, the proper function will be called
        to filter by the parameter.

        dataset_name: get_permissions_for_dataset()
        user: get_permissions_for_user()
        dataset_name,user: get_permissions_for_dataset_user()

    Args:
        dataset_name (None): Name of the dataset
        user (None): User to get permissions for.
            Either user ID or email as a string, or an
            instance of :class:`fiftyone.management.User`

    Returns:
        Output of get_permissions* call corresponding to input
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
    """
    Gets list of users that have access to a given dataset.
        Example output:
        [{'name': 'A. User', 'id': '12345', 'permission': 'MANAGE},
         {'name': 'B. User', 'id': '67890', 'permission': 'EDIT'}
        ]

    Args:
        dataset_name: Name of the dataset

    Returns:
        List of user name, id, and permission level
    """
    client = connection.ApiClientConnection().client
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
    """
    Gets access permission that a given user has to a given dataset.
        If user does not have access, returns NO_ACCESS

    Args:
        dataset_name: Name of the dataset
        user: User to get permissions for.
            Either user ID or email as a string, or an
            instance of :class:`fiftyone.management.User`

    Returns:
        :class:`fiftyone.management.DatasetPermission`
    """
    user_id = users._resolve_user_id(user)
    client = connection.ApiClientConnection().client
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
    """
    Gets list of datasets a given user has access to,
        and returns corresponding permission level.

        Example output:
        [{'name': 'A. User', 'id': '12345', 'permission': 'MANAGE},
         {'name': 'B. User', 'id': '67890', 'permission': 'EDIT'}
        ]

    Args:
        user: User to get permissions for.
            Either user ID or email as a string, or an
            instance of :class:`fiftyone.management.User`

    Returns:
        List of dataset name and permission for the user
    """
    user_id = users._resolve_user_id(user)

    client = connection.ApiClientConnection().client
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
    """
    Sets default permission for the given dataset.
        Calling user must be an admin or a manager
        of the dataset.

    Args:
        dataset_name: Name of the dataset
        permission: Permission to set as default for dataset.
            Instance of :class:`fiftyone.management.DatasetPermission`.

    Returns:
        None
    """
    client = connection.ApiClientConnection().client
    client.post_graphql_request(
        query=_SET_DATASET_DEFAULT_PERM_QUERY,
        variables={"identifier": dataset_name, "permission": permission.value},
    )


def set_dataset_user_permission(
    dataset_name: str,
    user: Union[str, users.User],
    permission: DatasetPermission,
) -> None:
    """
    Sets permissions to the dataset for a particular user.
        Calling user must be an admin or a manager
        of the dataset.

    Args:
        dataset_name: Name of dataset
        user: User to set permissions for.
            Either user ID or email as a string, or an
            instance of :class:`fiftyone.management.User`
        permission: Permission to set for given user on this dataset.
            Instance of :class:`fiftyone.management.DatasetPermission`.

    Returns:
        None
    """
    user_id = users._resolve_user_id(user)

    client = connection.ApiClientConnection().client
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
    """
    Removes specific permissions to the dataset for
        a particular user. The user will have permissions
        set by the dataset's default permissions now.
        Calling user must be an admin or a manager
        of the dataset.

    Args:
        dataset_name: Name of dataset
        user: User to remove permissions for.
            Either user ID or email as a string, or an
            instance of :class:`fiftyone.management.User`

    Returns:
        None
    """
    user_id = users._resolve_user_id(user)

    client = connection.ApiClientConnection().client
    client.post_graphql_request(
        query=_REMOVE_DATASET_USER_PERM_QUERY,
        variables={
            "identifier": dataset_name,
            "userId": user_id,
        },
    )
