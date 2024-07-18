"""
User management.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import dataclasses
import datetime
import enum
import re
from typing import List, Optional, Union

from fiftyone.management import connection
from fiftyone.management import util as fom_util


class UserRole(enum.Enum):
    """User role enum."""

    ADMIN = "ADMIN"
    MEMBER = "MEMBER"
    COLLABORATOR = "COLLABORATOR"
    GUEST = "GUEST"


@dataclasses.dataclass
class User(object):
    """User information dataclass."""

    id: str
    name: str
    email: str
    role: UserRole

    def __post_init__(self):
        if isinstance(self.role, str):
            self.role = UserRole[self.role]


@dataclasses.dataclass
class Invitation(object):
    """Invitation dataclass."""

    id: str
    created_at: datetime.datetime
    expires_at: datetime.datetime
    invitee_email: str
    invitee_role: UserRole
    url: str

    def __post_init__(self):
        if isinstance(self.invitee_role, str):
            self.invitee_role = UserRole[self.invitee_role]


def _validate_user_role(
    candidate_user_role: Union[str, UserRole, None], nullable: bool = False
) -> Optional[str]:
    if candidate_user_role is None and nullable:
        return None

    if isinstance(candidate_user_role, UserRole):
        return candidate_user_role.value
    elif isinstance(candidate_user_role, str):
        try:
            return UserRole[candidate_user_role].value
        except KeyError:
            ...
    raise ValueError(f"Invalid user role {candidate_user_role}")


_DELETE_INVITATION_QUERY = """
    mutation($invitationId: String!) {
      revokeUserInvitation(invitationId: $invitationId)
    }
"""

_DELETE_USER_QUERY = """
    mutation($userId: String!) {
      removeUser(userId: $userId)
    }
"""

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


def delete_user(user: Union[str, User]) -> None:
    """Deletes the given user.

    .. note::

        Only admins can perform this action.

    .. warning::

        This action is irreversible! Once deleted, the user will have to be
        re-invited to the organization to have access again.

    Examples::

        import fiftyone.management as fom

        delete_user = "guest@company.com"

        fom.delete_user(delete_user)

        assert fom.get_user(delete_user) is None

    Args:
        user: a user ID, email string, or :class:`User` instance
    """
    user_id = resolve_user_id(user)

    client = connection.APIClientConnection().client
    client.post_graphql_request(
        query=_DELETE_USER_QUERY, variables={"userId": user_id}
    )


def delete_user_invitation(invitation: str) -> None:
    """Deletes/revokes a previously-sent invitation if it has not been accepted.

    .. note::

        Only admins can perform this action.

    Examples::

        import fiftyone.management as fom

        new_guest = "guest@company.com"

        invite_id = fom.send_user_invitation(new_guest, fom.GUEST)

        # Delete by invitation ID
        fom.delete_user_invitation(invite_id)

        # Delete by user email
        fom.delete_user_invitation(new_guest)

        pending = fom.list_pending_invitations()
        assert not any(p.id == invite_id for p in pending)


    Args:
        invitation: an invitation ID as returned by
            :meth:`send_user_invitation`, or email address
    """
    client = connection.APIClientConnection().client

    if _ROUGH_EMAIL_REGEX.fullmatch(invitation):
        matching_invite = next(
            (
                i
                for i in list_pending_invitations()
                if i.invitee_email == invitation
            ),
            None,
        )
        if not matching_invite:
            raise ValueError(
                f"No pending invitation found for email {invitation}"
            )
        invitation_id = matching_invite.id

    else:
        invitation_id = invitation

    client.post_graphql_request(
        query=_DELETE_INVITATION_QUERY,
        variables={"invitationId": invitation_id},
    )


def get_user(user: str) -> Union[User, None]:
    """Gets information about the specified user (if any).

    .. note::

        Only admins can retrieve information about other users.

    Examples::

        import fiftyone.management as fom

        known_user = "member@company.com"
        user = fom.get_user(known_user)
        assert user.email == known_user

        unknown_user = "unknown@company.com"
        assert fom.get_user(unknown_user) is None

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
    return User(**data["user"]) if data["user"] else None


def list_pending_invitations() -> List[Invitation]:
    """Returns a list of pending user invitations.

    .. note::

        Only admins can retrieve this information.

    Examples::

        import fiftyone.management as fom

        fom.list_pending_invitations()

    Returns:
        a list of :class:`Invitation` instances
    """
    client = connection.APIClientConnection().client

    data = client.post_graphql_request(query=_LIST_PENDING_INVITATIONS_QUERY)
    invitations = data["invitations"]
    return [
        Invitation(**fom_util.camel_to_snake_container(invitation))
        for invitation in invitations
    ]


def list_users(verbose=True) -> Union[List[User], List[str]]:
    """Returns a list of all users.

    .. note::

        Only admins can retrieve this information.

    Examples::

        import fiftyone.management as fom

        fom.list_users()

    Args:
        verbose (True): if True, return a list of :class:`User` instances;
            if False, return a list of user emails

    Returns:
        a list of :class:`User` instances
    """
    client = connection.APIClientConnection().client
    users = client.post_graphql_connectioned_request(
        _LIST_USERS_QUERY, "usersConnection"
    )
    if verbose:
        return [User(**user) for user in users]
    else:
        return [user["email"] for user in users]


def send_user_invitation(email: str, role: UserRole) -> str:
    """Sends an email invitation to join your FiftyOne Teams organization.

    .. note::

        Only admins can perform this action.

    Examples::

        import fiftyone.management as fom

        new_guest = "guest@company.com"

        invite_id = fom.send_user_invitation(new_guest, fom.GUEST)

        pending = fom.list_pending_invitations()
        assert any(p.invitee_email == new_guest for p in pending)

    Args:
        email: the email address
        role: the :class:`UserRole` to grant the new user

    Returns:
        the invitation ID string
    """
    role_str = _validate_user_role(role)
    client = connection.APIClientConnection().client

    data = client.post_graphql_request(
        query=_SEND_INVITATION_QUERY,
        variables={"email": email, "role": role_str},
    )
    return data["sendUserInvitation"]["id"]


def set_user_role(user: Union[str, User], role: UserRole) -> None:
    """Sets the role of the given user.

    .. note::

        Only admins can perform this action.

    Examples::

        import fiftyone.management as fom

        user = "user@company.com"

        #1.a set role from email
        fom.set_user_role(user, fom.MEMBER)

        #1.b set role from user instance
        user_obj = fom.get_user(user_obj)
        fom.set_user_role(user_obj, fom.MEMBER)

        assert fom.get_user(user).role == fom.MEMBER

    Args:
        user: a user ID, email string, or :class:`User` instance
        role: the :class:`UserRole` to set
    """
    role_str = _validate_user_role(role)
    user_id = resolve_user_id(user)

    client = connection.APIClientConnection().client
    client.post_graphql_request(
        query=_SET_USER_ROLE_QUERY,
        variables={"userId": user_id, "role": role_str},
    )


def whoami() -> User:
    """Returns information about the calling user.

    Examples::

        import fiftyone.management as fom

        me = fom.whoami()

        assert fom.get_user(me.id) == me

    Returns:
        :class:`User`
    """
    client = connection.APIClientConnection().client

    data = client.post_graphql_request(query=_VIEWER_QUERY)
    return User(**data["viewer"])


_ROUGH_EMAIL_REGEX = re.compile(
    r"^[A-Za-z0-9._+\-\']+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$"
)


def resolve_user_id(
    user_or_id_or_email: Union[str, User, None],
    nullable: bool = False,
    pass_unknown_email: bool = False,
) -> Optional[str]:
    """Resolves user ID - by looking up user by email if it has to"""
    if user_or_id_or_email is None:
        if nullable:
            return None
        else:
            raise ValueError("User ID must not be None")
    if isinstance(user_or_id_or_email, User):
        return user_or_id_or_email.id
    if isinstance(user_or_id_or_email, dict) and "id" in user_or_id_or_email:
        return user_or_id_or_email["id"]
    if isinstance(user_or_id_or_email, str):
        if _ROUGH_EMAIL_REGEX.fullmatch(user_or_id_or_email):
            user = get_user(user_or_id_or_email)
            if user is None:
                if pass_unknown_email:
                    return user_or_id_or_email
                raise ValueError(
                    f"User email not found: {user_or_id_or_email}"
                )
            return user.id
        else:
            return user_or_id_or_email
    else:
        raise ValueError(f"Invalid user type", type(user_or_id_or_email))
