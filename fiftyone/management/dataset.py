"""
Dataset management.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import enum
from typing import Dict, Optional, Union

from fiftyone.management import connection
from fiftyone.management import users
from fiftyone.management.user_groups import UserGroup, resolve_user_group_id
from fiftyone.management.exceptions import FiftyOneManagementError


class DatasetPermission(enum.Enum):
    """Dataset permission enum."""

    NO_ACCESS = "NO_ACCESS"
    VIEW = "VIEW"
    TAG = "TAG"
    EDIT = "EDIT"
    MANAGE = "MANAGE"


def _validate_dataset_permission(
    candidate_dataset_permission: Union[None, str, DatasetPermission],
    nullable: bool = False,
) -> Union[str, None]:
    if candidate_dataset_permission is None and nullable:
        return None

    if isinstance(candidate_dataset_permission, DatasetPermission):
        return candidate_dataset_permission.value
    elif isinstance(candidate_dataset_permission, str):
        try:
            return DatasetPermission[candidate_dataset_permission].value
        except KeyError:
            ...
    raise FiftyOneManagementError(
        f"Invalid dataset permission {candidate_dataset_permission}"
    )


_DELETE_DATASET_USER_PERM_QUERY = """
    mutation($identifier: String!, $userId: String!) {
      removeDatasetUserPermission(
            datasetIdentifier: $identifier
            userId: $userId
        ) { id }
    }
"""


_GET_DATASET_CREATOR_QUERY = """
    query ($dataset: String!) {
        dataset (identifier: $dataset) {
            createdBy {
                id
                name
                email
                role
            }
        }
    }
"""

_GET_PERMISSIONS_FOR_DATASET_QUERY = """
    query ($dataset: String!){
        dataset(identifier: $dataset) {
            users(first: 10000) {
                activePermission
                user {name, email, id}
            }
            userGroups(first: 10000) {name, id, description, permission}
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


_GET_PERMISSIONS_FOR_DATASET_USER_GROUP_QUERY = """
    query ($dataset: String!, $groupId: String!){
        dataset(identifier: $dataset) {
            userGroup(identifier: $groupId) { id, name, permission }
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


_GET_PERMISSIONS_FOR_USER_GROUP_QUERY = """
    query ($groupId: String!, $after: String){
        datasetsConnection(first: 25, after: $after, 
            order: {field: name}) {
            pageInfo {
                hasNextPage
                endCursor
            }
            edges {
                node {
                    name
                    userGroup(identifier: $groupId) {
                        permission
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


_SET_DATASET_USER_GROUP_PERM_QUERY = """
    mutation(
        $datasetId: String!,
        $groupId: String!,
        $permission: DatasetPermission!)
    {
        setDatasetUserGroupPermission(
            datasetIdentifier: $datasetId,
            permission: $permission,
            userGroupIdentifier: $groupId, 
        ) { id }
    }
"""


_DELETE_DATASET_USER_GROUP_PERM_QUERY = """
    mutation($datasetId: String!, $groupId: String!) {
      removeDatasetUserGroupPermission(
            datasetIdentifier: $datasetId,
            userGroupIdentifier: $groupId
        ) { id }
    }
"""


def delete_dataset_user_permission(
    dataset_name: str, user: Union[str, users.User]
) -> None:
    """Removes the given user's specific access to the given dataset.

    .. note::

        The caller must have ``Can Manage`` permissions on the dataset.

    Examples::

        import fiftyone.management as fom

        dataset_name = "special-dataset"
        user = "guest@company.com"

        fom.set_dataset_user_permission(dataset_name, user, fom.VIEW)

        fom.delete_dataset_user_permission(dataset_name, user)

        assert fom.get_permissions(dataset_name=dataset_name, user=user) == fom.NO_ACCESS

    Args:
        dataset_name: the dataset name
        user: a user ID, email string, or
            :class:`~fiftyone.management.users.User` instance.
    """
    user_id = users.resolve_user_id(user)

    client = connection.APIClientConnection().client
    client.post_graphql_request(
        query=_DELETE_DATASET_USER_PERM_QUERY,
        variables={
            "identifier": dataset_name,
            "userId": user_id,
        },
    )


def get_dataset_creator(dataset_name: str) -> Optional[users.User]:
    """Gets creator of a dataset, if known.

    Examples::

        import fiftyone.management as fom

        user = fom.get_dataset_creator("dataset")

    Args:
        dataset_name: the dataset name

    Raises:
        ValueError: if `dataset_name` does not exist or calling user
            does not have access to it.

    Returns:
        :class:`~fiftyone.management.users.User` instance, or
        ``None`` if dataset has no recorded creator.
    """
    client = connection.APIClientConnection().client
    dataset = client.post_graphql_request(
        query=_GET_DATASET_CREATOR_QUERY,
        variables={"dataset": dataset_name},
    )["dataset"]

    if dataset is None:
        raise ValueError("Unknown dataset or no permission to access.")

    user = dataset["createdBy"]

    return users.User(**user) if user is not None else None


def get_permissions(
    *,
    dataset_name: str = None,
    user: Union[str, users.User] = None,
    user_group: Union[str, UserGroup] = None,
):
    """Gets the specified dataset or user permissions.

    This method is a convenience wrapper around the methods below based on
    which arguments you provide:

    -   ``dataset_name``: :func:`get_permissions_for_dataset`
    -   ``user``: :func:`get_permissions_for_user`
    -   ``user_group``: :func:`get_permissions_for_dataset_user_group`
    -   ``dataset_name`` and ``user``: :func:`get_permissions_for_dataset_user`
    -   ``dataset_name`` and ``user_group``:
            :func:`get_permissions_for_dataset_user_group`

    .. note::

        Only admins can retrieve this information.

    Examples::

        import fiftyone.management as fom

        dataset_name = "special-dataset"
        user = "guest@company.com"

        # Get permissions for user
        assert (
            fom.get_permissions(user=user) ==
            fom.get_permissions_for_user(user)
        )

        # Get permissions for dataset
        assert (
            fom.get_permissions(dataset_name=dataset_name) ==
            fom.get_permissions_for_dataset(dataset_name)
        )

        # Get permissions for user-dataset combination
        assert (
            fom.get_permissions(dataset_name=dataset_name, user=user) ==
            fom.get_permissions_for_dataset_user(dataset_name, user)
        )

        # Get permissions for user group-dataset
        assert (
            fom.get_permissions(dataset_name=dataset_name,
                user_group="some-id") ==
            fom.get_permissions_for_dataset_user_group(dataset_name, "some-id")
        )

    Args:
        dataset_name (None): a dataset name
        user (None): a user ID, email string, or
            :class:`~fiftyone.management.users.User` instance
        user_group (None): a user group ID or name string, or a
            :class:`~fiftyone.management.user_groups.UserGroup` instance

    Returns:
        the requested user/dataset permissions
    """
    if not (dataset_name or user or user_group):
        raise FiftyOneManagementError(
            "Must specify at least one argument: "
            "dataset_name, or user or user_group."
        )
    elif dataset_name and user:
        return get_permissions_for_dataset_user(dataset_name, user)
    elif dataset_name and user_group:
        return get_permissions_for_dataset_user_group(dataset_name, user_group)
    elif user:
        return get_permissions_for_user(user)
    elif user_group:
        return get_permissions_for_user_group(user_group)
    elif dataset_name:
        return get_permissions_for_dataset(dataset_name)


def get_permissions_for_dataset(
    dataset_name: str, include_groups=True
) -> Dict:
    """Gets the list of users that have access to the given dataset.

    .. note::

        Only admins can retrieve this information.

    Examples::

        import fiftyone.management as fom

        dataset_name = "special-dataset"

        fom.get_permissions_for_dataset(dataset_name)

    Example output::

        [
            {'name': 'A. User', 'email': 'a@company.com', 'id': '12345', 'permission': 'MANAGE'},
            {'name': 'B. User', 'email': 'b@company.com', 'id': '67890', 'permission': 'EDIT'},
        ]

    Args:
        dataset_name: the dataset name

    Returns:
        If include_groups is True, return a dictionary contains a list of user
            info and group info. Otherwise, return a list of user info.
    """
    client = connection.APIClientConnection().client
    result = client.post_graphql_request(
        query=_GET_PERMISSIONS_FOR_DATASET_QUERY,
        variables={"dataset": dataset_name},
    )

    if result["dataset"] is None:
        raise ValueError(f"Dataset not found: {dataset_name}")

    users = [
        {
            "name": user["user"].get("name"),
            "email": user["user"].get("email"),
            "id": user["user"].get("id"),
            "permission": user.get("activePermission"),
        }
        for user in result["dataset"]["users"]
    ]
    if include_groups:
        data = {
            "groups": result["dataset"]["userGroups"],
            "users": users,
        }
        return data
    else:
        return users


def get_permissions_for_dataset_user(
    dataset_name: str, user: str
) -> DatasetPermission:
    """Gets the access permission (if any) that a given user has to a given
    dataset.

    .. note::

        Only admins can retrieve this information.

    Examples::

        import fiftyone.management as fom

        dataset_name = "special-dataset"
        user = "guest@company.com"

        fom.get_permissions_for_dataset_user(dataset_name, user)

    Args:
        dataset_name: the dataset name
        user: a user ID, email string, or :class:`~fiftyone.management.users.User`
            instance

    Returns:
        :class:`~fiftyone.management.dataset.DatasetPermission`
    """
    user_id = users.resolve_user_id(user)
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


def get_permissions_for_dataset_user_group(
    dataset_name: str, user_group: Union[str, UserGroup]
) -> DatasetPermission:
    """Gets the access permission (if any) that a given user group has to a given
    dataset.

    .. note::

        Only admins can retrieve this information.

    Examples::

        import fiftyone.management as fom

        dataset_name = "special-dataset"
        user_group = "interns"

        fom.get_permissions_for_dataset_user_group(dataset_name, user_group)

    Args:
        dataset_name: the dataset name
        user_group: a user group ID or name string or
            :class:`~fiftyone.management.user_groups.UserGroup`

    Returns:
        :class:`~fiftyone.management.dataset.DatasetPermission`
    """
    user_group_id = resolve_user_group_id(user_group)
    client = connection.APIClientConnection().client
    result = client.post_graphql_request(
        query=_GET_PERMISSIONS_FOR_DATASET_USER_GROUP_QUERY,
        variables={"groupId": user_group_id, "dataset": dataset_name},
    )
    if result["dataset"] is None:
        raise FiftyOneManagementError(f"Dataset not found: {dataset_name}")

    dataset_user_group = result["dataset"]["userGroup"]
    if dataset_user_group is None:
        return DatasetPermission.NO_ACCESS
    else:
        return DatasetPermission[dataset_user_group["permission"]]


def get_permissions_for_user(user: str):
    """Gets a list of datasets a given user has access to.

    .. note::

        Only admins can retrieve this information.

    Examples::

        import fiftyone.management as fom

        user = "guest@company.com"

        fom.get_permissions_for_user(user)

    Example output::

        [
            {'name': 'datasetA', 'permission': 'EDIT'},
            {'name': 'datasetB', 'permission': 'VIEW'},
        ]

    Args:
        user: a user ID, email string, or :class:`~fiftyone.management.User`
            instance

    Returns:
        a list of permission dicts
    """
    user_id = users.resolve_user_id(user)

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


def get_permissions_for_user_group(user_group: Union[str, UserGroup]):
    """Gets a list of datasets a given user group has access to.

    .. note::

        Only admins can retrieve this information.

    Examples::

        import fiftyone.management as fom

        user_group = "some-group-id"

        fom.get_permissions_for_user_group(user_group)

    Example output::

        [
            {'name': 'datasetA', 'permission': 'EDIT'},
            {'name': 'datasetB', 'permission': 'VIEW'},
        ]

    Args:
        user_group: a user group ID or name or
         :class:`~fiftyone.management.user_groups.UserGroup`

    Returns:
        a list of permission dicts
    """
    user_group_id = resolve_user_group_id(user_group)
    client = connection.APIClientConnection().client
    dataset_permissions = client.post_graphql_connectioned_request(
        query=_GET_PERMISSIONS_FOR_USER_GROUP_QUERY,
        variables={"groupId": user_group_id},
        connection_property="datasetsConnection",
    )

    return [
        {
            "name": ds_perm["name"],
            "permission": ds_perm["userGroup"]["permission"],
        }
        for ds_perm in dataset_permissions
        if ds_perm["userGroup"] is not None
    ]


def set_dataset_default_permission(
    dataset_name: str, permission: DatasetPermission
) -> None:
    """Sets the default member access level for the given dataset.

    .. note::

        The caller must have ``Can Manage`` permissions on the dataset.

    Examples::

        import fiftyone.management as fom

        dataset_name = "special-dataset"

        # Give every Member Edit access by default
        fom.set_dataset_default_permission(dataset_name, fom.EDIT)

    Args:
        dataset_name: the dataset name
        permission: the :class:`~fiftyone.management.dataset.DatasetPermission` to set
    """
    perm_str = _validate_dataset_permission(permission)
    client = connection.APIClientConnection().client
    client.post_graphql_request(
        query=_SET_DATASET_DEFAULT_PERM_QUERY,
        variables={"identifier": dataset_name, "permission": perm_str},
    )


def set_dataset_user_permission(
    dataset_name: str,
    user: Union[str, users.User],
    permission: DatasetPermission,
    invite: bool = False,
) -> None:
    """Grants the given user specific access to the given dataset at the
    specified permission level.

    .. note::

        The caller must have ``Can Manage`` permissions on the dataset.

    .. warning::

        If an unknown email is passed to this function and ``invite`` is
        ``True``, an invitation to join the organization will be sent to
        the email. The user will be created and have access to the dataset
        on invitation acceptance. Please double-check the email correctness
        before running.

    Examples::

        import fiftyone.management as fom

        dataset_name = "special-dataset"
        guest = "guest@company.com"
        new_guest = "new-guest@company.com"

        # Existing user
        fom.set_dataset_user_permission(dataset_name, guest, fom.VIEW)

        assert fom.get_permissions(dataset_name=dataset_name, user=guest) == fom.VIEW

        # Nonexisting user
        fom.set_dataset_user_permission(dataset_name, new_guest, fom.VIEW, invite=True)
        assert guest in [i.invitee_email for i in fom.list_pending_invitations()]

    Args:
        dataset_name: the dataset name
        user: a user ID, email string, or :class:`~fiftyone.management.users.User`
            instance
        permission: the :class:`~fiftyone.management.dataset.DatasetPermission` to grant
        invite (False): if ``True`` and ``user`` is an email, an invitation
            will be sent to join the organization.
    """
    perm_str = _validate_dataset_permission(permission)
    try:
        user_id = users.resolve_user_id(user, pass_unknown_email=invite)
    except ValueError as e:
        raise ValueError(
            "Unknown user. Pass invite=True to invite a "
            "nonexisting user by email"
        ) from e

    client = connection.APIClientConnection().client
    client.post_graphql_request(
        query=_SET_DATASET_USER_PERM_QUERY,
        variables={
            "identifier": dataset_name,
            "userId": user_id,
            "permission": perm_str,
        },
    )


def set_dataset_user_group_permission(
    dataset_name: str,
    user_group: Union[str, UserGroup],
    permission: Union[str, DatasetPermission],
) -> None:
    """Grants the given user group specific access to the given dataset at the
    specified permission level.

    .. note::

        The caller must have ``Can Manage`` permissions on the dataset.

    Examples::

        import fiftyone.management as fom

        dataset_name = "special-dataset"
        group_id = "some-group-id"

        fom.set_dataset_user_permission(dataset_name, group_id, fom.VIEW)

    Args:
        dataset_name: the dataset name
        user_group: a user group ID or name string or a
            :class:`~fiftyone.management.user_groups.UserGroup` instance
        permission: the :class:`~fiftyone.management.dataset.DatasetPermission`
    """
    perm_str = _validate_dataset_permission(permission)
    client = connection.APIClientConnection().client
    user_group_id = resolve_user_group_id(user_group)

    client.post_graphql_request(
        query=_SET_DATASET_USER_GROUP_PERM_QUERY,
        variables={
            "datasetId": dataset_name,
            "groupId": user_group_id,
            "permission": perm_str,
        },
    )


def remove_dataset_user_group_permission(
    dataset_name: str,
    user_group: Union[str, UserGroup],
) -> None:
    """Remove the user group's explicit access to the given dataset

    .. note::

        The caller must have ``Can Manage`` permissions on the dataset.

    Examples::

        import fiftyone.management as fom

        dataset_name = "special-dataset"
        group_id = "some-group-id"

        fom.remove_dataset_user_group_permission(dataset_name, group_id)

    Args:
        dataset_name: the dataset name
        user_group: a user group id or name string or a
            :class:`~fiftyone.management.user_groups.UserGroup` instance
    """
    client = connection.APIClientConnection().client
    user_group_id = resolve_user_group_id(user_group)

    client.post_graphql_request(
        query=_DELETE_DATASET_USER_GROUP_PERM_QUERY,
        variables={
            "datasetId": dataset_name,
            "groupId": user_group_id,
        },
    )