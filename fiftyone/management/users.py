"""
User management.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import datetime
import enum
import re
from typing import List, Optional, Union
from typing_extensions import Literal, TypedDict

from fiftyone.management import connection
from fiftyone.management import util as fom_util


class User(TypedDict):
    """User information dict."""

    id: str
    name: str
    email: str
    role: Literal["ADMIN", "MEMBER", "COLLABORATOR", "GUEST"]


class Invitation(TypedDict):
    """Invitation dict."""

    id: str
    created_at: datetime.datetime
    expires_at: datetime.datetime
    invitee_email: str
    invitee_role: Literal["ADMIN", "MEMBER", "COLLABORATOR", "GUEST"]
    url: str


class UserRole(enum.Enum):
    """User role enum."""

    ADMIN = "ADMIN"
    MEMBER = "MEMBER"
    COLLABORATOR = "COLLABORATOR"
    GUEST = "GUEST"


_GET_USER_QUERY = """
    query ($userId: String!) {
        user(id: $userId) {
            id
            name
            email
            role
        }
    }
"""

_LIST_PENDING_INVITATIONS_QUERY = """
    query {
        invitations {
            id
            createdAt
            expiresAt
            inviteeEmail
            inviteeRole
            url
        }
    }
"""

_LIST_USERS_QUERY = """
    query($after: String) {
        usersConnection(first:25, after: $after) {
            pageInfo{
                hasNextPage
                endCursor
            }
            edges {
                node {
                    id
                    name
                    email
                    role
                }
            }
        }
    }
"""

_REMOVE_USER_QUERY = """
    mutation($userId: String!) {
      removeUser(userId: $userId)
    }
"""

_REVOKE_INVITATION_QUERY = """
    mutation($invitationId: String!) {
      revokeUserInvitation(invitationId: $invitationId)
    }
"""

_SEND_INVITATION_QUERY = """
    mutation($email: String!, $role: UserRole!) {
      sendUserInvitation(email: $email, role: $role) { id }
    }
"""

_SET_USER_ROLE_QUERY = """
    mutation($userId: String!, $role: UserRole!) {
      setUserRole(userId: $userId, role: $role) { id }
    }
"""

_VIEWER_QUERY = """
    query {
        viewer {
            id
            name
            email
            role
        }
    }
"""


def get_user(user: str) -> Union[User, None]:
    """Gets information about the specified user (if any).

    .. note::

        Only admins can retrieve information about other users.

    Args:
        user: a user ID or email string

    Returns:
        :class:`User`, or ``None`` if no such user is found
    """
    client = connection.APIClientConnection().client

    data = client.post_graphql_request(
        query=_GET_USER_QUERY,
        variables={"userId": user},
    )
    return data["user"]


def list_pending_invitations() -> List[Invitation]:
    """Returns a list of pending user invitations.

    .. note::

        Only admins can retrieve this information.

    Returns:
        a list of :class:`Invitation` instances
    """
    client = connection.APIClientConnection().client

    data = client.post_graphql_request(query=_LIST_PENDING_INVITATIONS_QUERY)
    invitations = data["invitations"]
    return [
        {fom_util.camel_to_snake(var): val for var, val in invitation.items()}
        for invitation in invitations
    ]


def list_users() -> List[User]:
    """Returns a list of all users.

    .. note::

        Only admins can retrieve this information.

    Returns:
        a list of :class:`User` instances
    """
    client = connection.APIClientConnection().client
    return client.post_graphql_connectioned_request(
        _LIST_USERS_QUERY, "usersConnection"
    )


def remove_user(user: Union[str, User]) -> None:
    """Deletes the given user.

    .. note::

        Only admins can perform this action.

    Args:
        user: a user ID, email string, or :class:`User` instance
    """
    user_id = _resolve_user_id(user)

    client = connection.APIClientConnection().client
    client.post_graphql_request(
        query=_REMOVE_USER_QUERY, variables={"userId": user_id}
    )


def revoke_user_invitation(invitation_id: str) -> None:
    """Revokes a previously-sent invitation if it has not been accepted.

    .. note::

        Only admins can perform this action.

    Args:
        invitation_id: an invitation ID as returned by
            :meth:`send_user_invitation`
    """
    client = connection.APIClientConnection().client

    client.post_graphql_request(
        query=_REVOKE_INVITATION_QUERY,
        variables={"invitationId": invitation_id},
    )


def send_user_invitation(email: str, role: UserRole) -> str:
    """Sends an email invitation to join your FiftyOne Teams organization.

    .. note::

        Only admins can perform this action.

    Args:
        email: the email address
        role: the :class:`UserRole` to grant the new user

    Returns:
        the invitation ID string
    """
    client = connection.APIClientConnection().client

    data = client.post_graphql_request(
        query=_SEND_INVITATION_QUERY,
        variables={"email": email, "role": role.value},
    )
    return data["sendUserInvitation"]["id"]


def set_user_role(user: Union[str, User], role: UserRole) -> None:
    """Sets the role of the given user.

    .. note::

        Only admins can perform this action.

    Args:
        user: a user ID, email string, or :class:`User` instance
        role: the :class:`UserRole` to set
    """
    user_id = _resolve_user_id(user)

    client = connection.APIClientConnection().client
    client.post_graphql_request(
        query=_SET_USER_ROLE_QUERY,
        variables={"userId": user_id, "role": role.value},
    )


def whoami() -> User:
    """Returns information about the calling user.

    Returns:
        :class:`User`
    """
    client = connection.APIClientConnection().client

    data = client.post_graphql_request(query=_VIEWER_QUERY)
    return data["viewer"]


_ROUGH_EMAIL_REGEX = re.compile(
    r"^[A-Za-z0-9._+\-\']+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$"
)


def _resolve_user_id(
    user_or_id_or_email: Union[str, User, None], nullable: bool = False
) -> Optional[str]:
    """Resolves user ID - by looking up user by email if it has to"""
    if user_or_id_or_email is None:
        if nullable:
            return None
        else:
            raise ValueError("User ID must not be None")
    if isinstance(user_or_id_or_email, dict) and "id" in user_or_id_or_email:
        return user_or_id_or_email["id"]
    if isinstance(user_or_id_or_email, str):
        if _ROUGH_EMAIL_REGEX.fullmatch(user_or_id_or_email):
            user = get_user(user_or_id_or_email)
            if user is None:
                raise ValueError(
                    f"User email not found: {user_or_id_or_email}"
                )
            return user["id"]
        else:
            return user_or_id_or_email
    else:
        raise ValueError(f"Invalid user type", type(user_or_id_or_email))
