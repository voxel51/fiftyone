.. _teams-management-sdk:

Teams Management SDK
===========================

.. default-role:: code

Being able to do the same things in the UI as in Python code is
one of the big reasons we love FiftyOne!

There are specific operations that only exist for FiftyOne Teams,
such as management functions for: users, organization invitations,
dataset permissions, and API keys.

Setup
___________________
In order to use the FiftyOne Teams management SDK, you'll have to
configure your Python environment to connect to the API endpoint of
your Teams deployment. To do this, the following configuration
options are required. See :ref:`Configuring FiftyOne <configuring-fiftyone>`
for more about the FiftyOne `config` object.

+-------------------------------+-------------------------------------+-------------------------------+----------------------------------------------------------------------------------------+
| Config field                  | Environment variable                | Default value                 | Description                                                                            |
+===============================+=====================================+===============================+========================================================================================+
| `api_uri`                     | `FIFTYONE_API_URI`                  | `None`                        | The URI where the FiftyOne Teams API (`teams-api` container) is exposed. Check         |
|                               |                                     |                               | with your Teams admin for the value of this field for your deployment.                 |
+-------------------------------+-------------------------------------+-------------------------------+----------------------------------------------------------------------------------------+
| `api_key`                     | `FIFTYONE_API_KEY`                  | `None`                        | The FiftyOne Teams API key to use for authentication with the API. This key is         |
|                               |                                     |                               | unique to each user. See <blah> for information on creating an API key.                |
+-------------------------------+-------------------------------------+-------------------------------+----------------------------------------------------------------------------------------+


.. _teams-sdk-api-reference:

API reference
______________

Connection Methods
-------------------

.. code-block:: python

    import fiftyone.management as fom

    fom.reload_api_connection?
    fom.test_api_connection?

.. code-block:: python

    def reload_api_connection() -> None:
        """
        Reloads the API connection. This is necessary if the API URI
            or API Key are changed after the first usage of this module.
            This should rarely be needed unless if a script is working
            across deployments.
            E.g.
            ```
            import fiftyone.management as fom
            import fiftyone as fo

            # https://api.dev.mycompany.org
            print(fo.config.api_uri)
            fom.whoami()

            # Change API URI, need to reload cached connection
            fo.config.api_uri = "https://api.test.mycompany.org"
            fom.reload_api_connection()
            fom.whoami()
            ```

        Args:
            None

        Returns:
            None
        """

.. code-block:: python

    def test_api_connection():
        """
        Tests the API connection with progressively more intensive
            approaches. Either raises an exception if it fails, or
            prints "API Connection Succeeded"

        Args:
            None

        Returns:
            None
        """

API Key Management Methods
---------------------------

.. code-block:: python

    import fiftyone.management as fom

    fom.generate_api_key?
    fom.list_api_keys?
    fom.remove_api_key?

.. code-block:: python

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

.. code-block:: python

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

.. code-block:: python

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

User Management Methods
-----------------------

.. code-block:: python

    import fiftyone.management as fom

    # Data classes
    fom.User
    fom.UserRole

    # Methods
    fom.whoami?
    fom.list_users?
    fom.get_user?
    fom.remove_user?
    fom.set_user_role?

.. code-block:: python

    class User(TypedDict):
        """dict with information about a user"""

        id: str
        email: str
        role: Literal["ADMIN", "MEMBER", "COLLABORATOR", "GUEST"]

.. code-block:: python

    class UserRole(enum.Enum):
        """User role enum"""

        ADMIN = "ADMIN"
        MEMBER = "MEMBER"
        COLLABORATOR = "COLLABORATOR"
        GUEST = "GUEST"

.. code-block:: python

    def whoami() -> User:
        """
        Gets information about the calling user.

        Args:
            None

        Returns:
            :class:`fiftyone.management.User`
        """

.. code-block:: python

    def list_users() -> List[User]:
        """
        Lists all users. Caller must be an admin.

        Args:
            None

        Returns:
            List[:class:`fiftyone.management.User`]
        """

.. code-block:: python

    def get_user(user: str) -> Union[User, None]:
        """
        Gets information about a user
            Calling user must be an admin or
            requesting for their own user.

        Args:
            user: Either user ID or email as a string

        Returns:
            :class:`fiftyone.management.User`
            or None if user not found
        """

.. code-block:: python

    def remove_user(user: Union[str, User]) -> None:
        """
        Removes user. Calling user must be an admin.

        Args:
            user: User to remove.
                Either user ID or email as a string, or an
                instance of :class:`fiftyone.management.User`

        Returns:
            None
        """

.. code-block:: python

    def set_user_role(user: Union[str, User], role: UserRole) -> None:
        """
        Set role for a given user. Calling user must be an admin.

        Args:
            user: User to set role for.
                Either user ID or email as a string, or an
                instance of :class:`fiftyone.management.User`
            role: Role to set for given user. Should be an instance
                of the enum :class:`fiftyone.management.UserRole`

        Returns:
            None
        """

Invitation Methods
-------------------

.. code-block:: python

    import fiftyone.management as fom

    # Data classes
    fom.Invitation

    # Methods
    fom.list_pending_invitations?
    fom.send_user_invitation?
    fom.revoke_user_invitation?

.. code-block:: python

    class Invitation(TypedDict):
        """dict with information about an invitation"""

        id: str
        created_at: datetime.datetime
        expires_at: datetime.datetime
        invitee_email: str
        invitee_role: Literal["ADMIN", "MEMBER", "COLLABORATOR", "GUEST"]
        url: str

.. code-block:: python

    def list_pending_invitations() -> List[Invitation]:
        """
        List pending user invitations. Caller must be an admin

        Args:
            None

        Returns:
            List[:class:`fiftyone.management.Invitation`]
        """

.. code-block:: python

    def send_user_invitation(email: str, role: UserRole) -> str:
        """
        Send an invitation to join the FiftyOne Teams organization,
            to the given email address. Caller must be an admin.

        Args:
            email(str): Email address to send invitation to.
            role (:class:`fiftyone.management.UserRole`):
                Role to give this user once they accept invitation.

        Returns:
            Invitation ID as string
        """

.. code-block:: python

    def revoke_user_invitation(invitation_id: str) -> None:
        """
        Revokes a previously-sent invitation before it has been accepted.
            Caller must be an admin.

        Args:
            invitation_id (str): Invitation ID, same as return value of
                :meth:`send_user_invitation() <fiftyone.management.send_user_invitation>`

        Returns:
            None
        """
Dataset Permission Management Methods
-------------------------------------

.. code-block:: python

    import fiftyone.management as fom

    # Data classes
    fom.DatasetPermission

    # Methods
    fom.set_dataset_default_permission?
    fom.set_dataset_user_permission?
    fom.remove_dataset_user_permission?

.. code-block:: python

    class DatasetPermission(enum.Enum):
        """Dataset permission enum"""

        NO_ACCESS = "NO_ACCESS"
        VIEW = "VIEW"
        COMMENT = "COMMENT"
        EDIT = "EDIT"
        MANAGE = "MANAGE"

.. code-block:: python

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
                Instance of :class:`fiftyone.management.DatasetPermission`

        Returns:
            None
        """

.. code-block:: python

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

.. code-block:: python

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
