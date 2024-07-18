"""
Group management.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import dataclasses
from typing import List, Optional, Union, Any

from fiftyone.api.errors import FiftyOneTeamsAPIError
from fiftyone.management.connection import APIClientConnection
from fiftyone.management.users import User, resolve_user_id
from fiftyone.management.exceptions import FiftyOneManagementError


@dataclasses.dataclass
class UserGroup(object):
    """User Group information dataclass."""

    id: str
    name: str
    description: Optional[str]
    users: Optional[List[User]]

    def __post_init__(self):
        if self.users and isinstance(self.users[0], dict):
            self.users = [User(**user_dict) for user_dict in self.users]


_CREATE_USER_GROUP_QUERY = """
    mutation($name: String!, $description: String) {
      createUserGroup(name: $name, description: $description) {
            id
            name
            description
            users {
              id
              name
              email
              role
            }
        }
    }
"""

_UPDATE_USER_GROUP_QUERY = """
    mutation($groupId: String!, $name: String, $description: String) {
      updateUserGroupInfo(identifier: $groupId, 
        name: $name, description: $description) {
            id
            name
            description
            users {
              id
              name
              email
              role
            }
      }
    }
"""

_DELETE_USER_GROUP_QUERY = """
    mutation($groupId: String!) {
      deleteUserGroup(userGroupIdentifier: $groupId)
    }
"""

_GET_USER_GROUP_QUERY = """
    query ($groupId: String!) {
        userGroup(identifier: $groupId) {
            id
            name
            description
            users {
              id
              name
              email
              role
            }
        }
    }
"""


_LIST_USER_GROUP_FOR_USER_QUERY = """
    query($user_id: String!) {
        user(id: $user_id) {
            userGroups {
                id
                name
                description
                users {
                  id
                  name
                  email
                  role
                }
            }
        } 
    }
"""


_LIST_USER_GROUPS_QUERY = """
    query($first: Int!) {
        userGroups(first: $first) {
            id
            name
            description
            users {
              id
              name
              email
              role
            }
        }
    }
"""

_LIST_USER_GROUPS_QUERY_SIMPLIFIED = """
    query($first: Int!) {
        userGroups(first: $first) {
            name
        }
    }
"""


_ADD_USERS_TO_USER_GROUP_QUERY = """
    mutation($groupId: String!, $userIds: [String!]!)
    {
        addUserGroupUsers(userGroupIdentifier: $groupId, userIds: $userIds) {
            id
            name
            description
            users {
              id
              name
              email
              role
            }
        }
    }
"""

_REMOVE_USERS_FROM_USER_GROUP_QUERY = """
    mutation($groupId: String!, $userIds: [String!]!)
    {
        removeUserGroupUsers(userGroupIdentifier: $groupId, 
        userIds: $userIds) {
            id
            name
            description
            users {
              id
              name
              email
              role
            }
        }
    }
"""


def add_users_to_group(
    user_group: str, users: Union[List[Any], str], resolved_users: bool = False
) -> UserGroup:
    """Adds users to the given group.

    .. note::

        Only admins can perform this action.

    Examples::

        import fiftyone.management as fom

        group_id = "group id"
        user_ids = ["user id 1", "user id 2"]

        fom.add_users_to_group(user_group=group_id, user_ids=user_ids)

    Args:
        user_group: a group ID, name string, or :class:`Group` instance
        users (None): list of users (email or ID strings or User instances or
            dictionary objects with valid fields) or a single user string/obj
        resolved_users (False): If True, the user_ids are already
            resolved/validated
    """
    if resolved_users:
        resolved_user_ids = [users] if isinstance(users, str) else users
    elif isinstance(users, str):
        resolved_user_ids = [resolve_user_id(users)]
    else:
        resolved_user_ids = [resolve_user_id(_user_id) for _user_id in users]

    # resolving group id from name, id, or UserGroup object
    group_id = resolve_user_group_id(user_group)

    client = APIClientConnection().client
    data = client.post_graphql_request(
        query=_ADD_USERS_TO_USER_GROUP_QUERY,
        variables={
            "groupId": group_id,
            "userIds": resolved_user_ids,
        },
    )
    return (
        UserGroup(**data["addUserGroupUsers"])
        if data.get("addUserGroupUsers")
        else None
    )


def create_user_group(
    name: str,
    description: Optional[str] = None,
    users: Optional[List[Union[str, User]]] = None,
) -> UserGroup:
    """Creates a new user group.

    .. note::

        Only admins can perform this action.

    Examples::

        import fiftyone.management as fom

        group_name = "Name"
        group_description = "Description"
        fom.add_user_group(name=group_name, description=group_description)

        assert fom.get_user_group(group_name) is not None

    Args:
        name: group name, string
        description (None): optional group description, string
        users (None): optional list of user_ids, names or Users instance
    """
    client = APIClientConnection().client

    # validate user ids
    user_ids = [resolve_user_id(user) for user in users] if users else None

    data = client.post_graphql_request(
        query=_CREATE_USER_GROUP_QUERY,
        variables={
            "name": name,
            "description": description,
        },
    )

    group = (
        UserGroup(**data["createUserGroup"])
        if data.get("createUserGroup")
        else None
    )

    if not group:
        raise FiftyOneManagementError("Failed to create user group")

    if group and user_ids:
        return add_users_to_group(group.id, user_ids, resolved_users=True)
    else:
        return group


def delete_user_group(user_group: Union[str, UserGroup]) -> None:
    """Deletes the given group.

    .. note::

        Only admins can perform this action.

    .. warning::

        This action is irreversible!

    Examples::

        import fiftyone.management as fom

        group_name = "Group Name"
        fom.delete_user_group(group_name)

        assert fom.get_user_group(group_name) is None

    Args:
        user_group: a group ID, name string, or :class:`Group` instance
    """
    group_id = resolve_user_group_id(user_group)

    client = APIClientConnection().client
    client.post_graphql_request(
        query=_DELETE_USER_GROUP_QUERY, variables={"groupId": group_id}
    )


def get_user_group(user_group: str) -> Union[UserGroup, None]:
    """Gets information about the specified group (if any).

    .. note::

        Only admins can retrieve information about user groups.

    Examples::

        import fiftyone.management as fom

        group_name = "Group Name"
        group = fom.get_user_group(group_name)
        assert group.name == group_name

        unknown_group = "Unknown Group"
        assert fom.get_user_group(unknown_group) is None

    Args:
        user_group: a group ID or name string

    Returns:
        :class:`Group`, or ``None`` if no such group is found
    """
    try:
        client = APIClientConnection().client

        data = client.post_graphql_request(
            query=_GET_USER_GROUP_QUERY,
            variables={"groupId": user_group},
        )
        return (
            UserGroup(**data["userGroup"]) if data.get("userGroup") else None
        )
    except FiftyOneTeamsAPIError:
        return


def list_user_groups_for_user(
    user: Union[str, dict, User], verbose=False
) -> (List)[dict]:
    """Gets all user groups for the given user.

    If the user_id does not exist, an empty list is returned.

    if the email address is incorrect, an exception is raised.

    If there is no group associated with the user, an empty list is returned.

    .. note::

        Only admins can retrieve this information.

    Examples::

        import fiftyone.management as fom

        user_id = "user id"
        fom.list_user_groups_for_user(user_id)

    Args:
        user: a user ID or email string, or
            :class:`~fiftyone.management.users.User` instance
        verbose (True): If True, returns the list of groups, otherwise return
            the list of group names

    Returns:
        a list of dictionaries containing user group information or a list of
            group names
    """
    user_id = resolve_user_id(user)
    client = APIClientConnection().client
    data = client.post_graphql_request(
        query=_LIST_USER_GROUP_FOR_USER_QUERY,
        variables={"user_id": user_id},
    )
    # filter the groups with null user values
    if verbose:
        return data["user"]["userGroups"]
    else:
        return [r["name"] for r in data["user"]["userGroups"]]


def list_user_groups(
    num_groups: int = 100, verbose=False
) -> Union[List[UserGroup], List[str]]:
    """Returns a list of all user groups.

    .. note::

        Only admins can retrieve this information.

    Examples::

        import fiftyone.management as fom

        fom.list_user_groups()

    Args:
        num_groups (100): The number of user groups to fetch
        verbose (False): If True, returns the list of groups, otherwise return
        the list of group names

    Returns:
        a list of :class:`Group` instances or a list of group names
    """
    client = APIClientConnection().client

    if verbose:
        groups = client.post_graphql_request(
            query=_LIST_USER_GROUPS_QUERY, variables={"first": num_groups}
        ).get("userGroups", [])

        return [UserGroup(**group) for group in groups]
    else:
        groups = client.post_graphql_request(
            query=_LIST_USER_GROUPS_QUERY_SIMPLIFIED,
            variables={"first": num_groups},
        ).get("userGroups", [])

        return [group["name"] for group in groups]


def remove_users_from_group(
    user_group: str, users: Union[List[Any], str], resolved_users: bool = False
) -> UserGroup:
    """Removes users from the given group.

    .. note::

        Only admins can perform this action.

    Examples::

        import fiftyone.management as fom

        user_group = "group id"
        user_ids = ["user id 1", "user id 2"]

        fom.remove_users_from_group(user_group=group_id, user_ids=user_ids)

    Args:
        user_group: a group ID, name string, or :class:`Group` instance
        users (None): list of users (email or ID strings or User instances or
            dictionary objects with valid fields) or a single user string/obj
        resolved_users (False): If True, the user_ids are already resolved/validated
    """
    group_id = resolve_user_group_id(user_group)

    if resolved_users:
        resolved_user_ids = [users] if isinstance(users, str) else users
    elif isinstance(users, str):
        resolved_user_ids = [resolve_user_id(users)]
    else:
        resolved_user_ids = [resolve_user_id(_user_id) for _user_id in users]

    client = APIClientConnection().client
    data = client.post_graphql_request(
        query=_REMOVE_USERS_FROM_USER_GROUP_QUERY,
        variables={
            "groupId": group_id,
            "userIds": resolved_user_ids,
        },
    )
    return (
        UserGroup(**data["removeUserGroupUsers"])
        if data.get("removeUserGroupUsers")
        else None
    )


def update_user_group(
    user_group: str,
    name: Optional[str] = None,
    description: Optional[str] = None,
    users: Optional[List[Union[str, UserGroup]]] = None,
) -> UserGroup:
    """Updates the given group.

    .. note::

        Only admins can perform this action.

    Examples::

        import fiftyone.management as fom

        group_id = "group id"
        group_name = "New Name"
        fom.update_user_group(user_group=group_id, name=group_name)

        assert fom.get_user_group(group_name) is not None

    Args:
        user_group: a group ID, name string, or :class:`Group` instance
        name (None): group name, string
        description (None): group description, string
        users (None): list of user id, name string or User instance. Existing
            users not in this list will be removed.
    """
    client = APIClientConnection().client
    payload = {}
    # resolving user group id from name, id, or UserGroup object
    group_id = resolve_user_group_id(user_group)

    if not (name or description or users is not None):
        raise FiftyOneManagementError(
            "Either name or description or user_ids must be provided."
        )

    # validate user ids, accept users as empty list
    user_ids = (
        [resolve_user_id(user) for user in users]
        if users is not None
        else None
    )
    group = None

    if name or description:
        payload["name"] = name
        payload["description"] = description
        payload["groupId"] = group_id
        data = client.post_graphql_request(
            query=_UPDATE_USER_GROUP_QUERY,
            variables=payload,
        )

        group = (
            UserGroup(**data["updateUserGroupInfo"])
            if data.get("updateUserGroupInfo")
            else None
        )

    if user_ids is not None:
        # in case group is not updated, fetch group information
        group = group or get_user_group(group_id)

        if group:
            existing_user_ids = [user.id for user in group.users]
            users_to_add = list(set(user_ids) - set(existing_user_ids))
            if users_to_add:
                group = add_users_to_group(
                    group_id, users_to_add, resolved_users=True
                )

            users_to_remove = list(set(existing_user_ids) - set(user_ids))
            if users_to_remove:
                group = remove_users_from_group(
                    group_id, users_to_remove, resolved_users=True
                )
    return group


def resolve_user_group_id(
    group_or_id_or_name: Union[str, UserGroup, None, dict],
) -> str:
    """Resolves group ID - by looking up group by name if it has to"""
    if group_or_id_or_name is None:
        raise FiftyOneManagementError("Group ID must not be None")
    if isinstance(group_or_id_or_name, UserGroup):
        return group_or_id_or_name.id
    if isinstance(group_or_id_or_name, dict) and "id" in group_or_id_or_name:
        return group_or_id_or_name["id"]
    if isinstance(group_or_id_or_name, str):
        group = get_user_group(group_or_id_or_name)
        if group is None:
            raise FiftyOneManagementError(
                f"Group id or name not found: {group_or_id_or_name}"
            )
        return group.id
    else:
        raise FiftyOneManagementError(
            f"Invalid group type: {type(group_or_id_or_name)}"
        )
