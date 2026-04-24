.. _enterprise-roles-and-permissions:

Roles and permissions
=====================

.. default-role:: code

FiftyOne Enterprise is built for collaboration, with the goal of making it as
easy as possible for engineers, data scientists, and stakeholders to work
together to build high quality datasets and computer vision models.

Accordingly, FiftyOne Enterprise gives you the flexibility to configure user
roles, user groups and fine-grained permissions so that you can safely and
securely collaborate both inside and outside your organization at all stages of
your workflows.

This page introduces the basic roles and permissions available in
FiftyOne Enterprise.

.. _enterprise-roles:

Roles
_____

FiftyOne Enterprise has five user roles: Admin, Member, Collaborator,
Labeler, and Guest.

Admins can access user management features by clicking on their account icon in
the upper-right of the FiftyOne Enterprise App and navigating to the
"Settings > Team > Users" page:

.. image:: /images/enterprise/admin_team_users_page.png
   :alt: admin-team-users-page
   :align: center

Admins can invite new users by clicking on "Invite people", as shown below.
Invited users will receive an email invitation with a link to accept the
invitation.

.. note::

   Invited users may login using any identity provider that has been enabled on
   your  deployment. If you need more information about configuring IdPs or
   increasing your user quotas, contact your Voxel51 support team.

.. image:: /images/enterprise/user_invitation.png
   :alt: user-invitation
   :align: center

.. _enterprise-admin:

Admin
-----

Admins have full access to all of an organization's datasets and can
create, edit, and delete any dataset.

Admins can also invite or remove users from the organization and change any
other user's roles, including promoting/demoting users to admins.

.. _enterprise-member:

Member
------

Members can create new datasets and can be granted any desired level of
permission on existing datasets. Members may also have a
:ref:`default access level <enterprise-default-access>` to datasets that use this
feature.

Members do not have the ability to see or manage an organization's users.

.. _enterprise-collaborator:

Collaborator
------------

Collaborators only have access to datasets to which they have been specifically
granted access (a dataset's
:ref:`default access level <enterprise-default-access>` does not apply to
Collaborators), and they may only be granted **Can view**,  **Can tag** 
or **Can edit** access to datasets.

Collaborators cannot create new datasets, clone existing datasets, or view
other users of the deployment. Collaborators may export datasets to which
they've been granted access.

.. _enterprise-labeler:

Labeler
-------

Labelers only have access to datasets to which they have been specifically
granted access (a dataset's
:ref:`default access level <enterprise-default-access>` does not apply to
Labelers), and they may only be granted **Can view** or **Can tag** access
to datasets. Additionally, Labelers can update annotations and metadata on
samples using FiftyOne's :ref:`in-App annotation features <in-app-annotation>`,
but cannot make changes to the Annotation Schema.

Labelers cannot create new datasets, clone existing datasets, export datasets, or
view other users of the deployment.

.. _enterprise-guest:

Guest
-----

Guests only have access to datasets to which they have been specifically
granted access (a dataset's
:ref:`default access level <enterprise-default-access>` does not apply to Guests),
and they may only be granted **Can view** access to datasets.

Guests cannot create new datasets, clone existing datasets, export datasets, or
view other users of the deployment.

.. _enterprise-groups:

Groups
------

User groups in FiftyOne Enterprise allow organization admins to manage a
collection of users as a single entity. This simplifies the process of
assigning permissions to multiple users, making it more efficient to control
access to datasets.

Admins can manage groups through the "Settings > Team > Groups" page.
Each group can be given specific dataset access permissions, which apply to
all users within the group. Collaborators', labelers', and guests' access to
the dataset is limited by the maximum dataset access level of the role. 

.. image:: /images/enterprise/admin_team_groups_page.png
   :alt: admin-team-groups-page
   :align: center

Admins can create a new group by clicking on "Create group" and then adding
existing users to the group by clicking on "Add users".

.. image:: /images/enterprise/admin_create_group.png
   :alt: admin-create-group
   :align: center

.. image:: /images/enterprise/admin_add_users_to_team.png
   :alt: admin-team-add-users-to-team
   :align: center

.. note::

   Non-existing users cannot be directly added to a group. Users must be
   invited and accept the invitation before they can be added to a group.

.. _enterprise-service-accounts:

Service accounts
----------------

Service accounts are non-human principals designed for programmatic, automated,
or machine-to-machine access to FiftyOne Enterprise. They authenticate
exclusively via API keys and cannot log in interactively through the App.

Common use cases include:

-  CI/CD pipelines that run model evaluation or dataset quality checks
-  Data ingestion scripts that upload and curate samples automatically
-  Automated annotation workflows and model-in-the-loop jobs
-  Any process that needs to interact with FiftyOne without a human user

Unlike human users, service accounts have no email address, no user profile,
and cannot receive invitations.

.. note::

   Only admins can create, view, update, or delete service accounts.

**Roles**

Service accounts support the same five roles as human users: Admin, Member,
Collaborator, Labeler, and Guest. The chosen role determines what the service
account can do, such as which datasets it can access by default and whether it
can create new datasets.

**Groups**

Service accounts can be added to
:ref:`user groups <enterprise-groups>` in the same way as human users,
allowing you to manage dataset permissions for a set of service accounts (or a
mix of users and service accounts) as a single entity.

**Dataset permissions**

Service accounts can be granted individual or group-based dataset permissions
using the same permission model as human users. All five permission levels —
**No access**, **Can view**, **Can tag**, **Can edit**, and **Can manage** — apply,
subject to the service account's role.

**Managing service accounts via the UI**

Admins can manage service accounts through the
"Settings > Team > Service Accounts" page:

.. image:: /images/enterprise/admin_team_service_accounts_page.png
   :alt: admin-team-service-accounts-page
   :align: center

Create a new service account by clicking "Create service account" and
providing a name, role, and optional description:

.. image:: /images/enterprise/admin_create_service_account.png
   :alt: admin-create-service-account
   :align: center

Click on a service account to view its details, edit its name, role, or
description, and manage its API keys:

.. image:: /images/enterprise/admin_service_account_detail.png
   :alt: admin-service-account-detail
   :align: center

**Managing service accounts via the SDK**

Service accounts can also be managed programmatically using the
:ref:`Management SDK <enterprise-management-sdk>`:

.. code-block:: python

   import fiftyone.management as fom

   # Create a service account
   sa = fom.create_service_account("my-pipeline-bot", fom.MEMBER)
   print(sa.id)

   # List all service accounts
   service_accounts = fom.list_service_accounts()

   # Retrieve a specific service account by ID
   sa = fom.get_service_account(sa.id)

   # Update a service account's name, role, or description
   fom.update_service_account(sa, role=fom.COLLABORATOR, description="Read-only bot")

   # Delete a service account (irreversible)
   fom.delete_service_account(sa)

**API keys**

Service accounts authenticate via API keys. These can be generated through the
UI on the "Settings > Team > Service Accounts" page, or programmatically:

.. code-block:: python

   import fiftyone.management as fom

   sa = fom.get_service_account("some-id")

   # Generate an API key for the service account
   key = fom.generate_api_key("pipeline-key", sa)

   # List all keys for a service account
   keys = fom.list_api_keys(sa)

   # Delete a specific key
   fom.delete_api_key(keys[0].id, sa)

Once you have an API key, configure the service account's connection the same
way as a human user — by setting `FIFTYONE_API_URI` and `FIFTYONE_API_KEY`.
See :ref:`API Connection <enterprise-api-connection>` for details.

.. warning::

   API keys are only displayed once at generation time. Copy and store the key
   securely immediately — it cannot be recovered if lost.

.. _enterprise-permissions:

Permissions
___________

Admins and users with the **Can manage** permission on a dataset can configure
a dataset's permissions under the dataset's
:ref:`Manage tab <enterprise-managing-datasets>` in the FiftyOne Enterprise App.

In FiftyOne Enterprise, dataset permissions for a user are determined by both
the access they receive from their groups' permissions and individual
permissions assigned to them.

A user’s permissions on a dataset is the maximum of their permissions from the
following sources:

-  Admins implicitly have full access to all datasets
-  Members have the dataset's
   :ref:`default access level <enterprise-default-access>`
-  Users may be granted :ref:`specific access <enterprise-specific-access>` to the
   dataset
-  Users may be members of one or more groups, each of which may have
   :ref:`specific access <enterprise-specific-access>` to the dataset

.. note::

   User role determines the highest level of access that a user can be granted
   to a dataset. For example, a user with Guest role can be added to a group
   with **Can edit** permission to a dataset, but this user will have
   **Can view** permission instead of **Can edit** permission of the dataset,
   because Guest role only allows **Can view** permission to datasets.

.. _enterprise-default-access:

Default access
--------------

All datasets have a default access level, which defines a minimum permission
level that all Members have on the dataset. 

A dataset's default access level can be set to **No access**, **Can view**,
**Can tag**, **Can edit**, or **Can manage** as shown below:

.. image:: /images/enterprise/dataset_default_access.png
   :alt: default-access
   :align: center

.. note::

   Default access level only applies to Members. Guests, Labelers, and
   Collaborators must be granted
   :ref:`specific access <enterprise-specific-access>` to datasets.

.. _enterprise-specific-access:

Specific access
---------------

Authorized users can grant specific access to a dataset using the "People and
groups with access" section shown below.

To give access to an existing user or group, simply click "Share" button on
the top right. A list of users with access to the dataset is shown. Click
"Add User" or "Add Group" to grant access to a new user or group.

.. image:: /images/enterprise/share_dataset.png
   :alt: specific-access
   :align: center

.. image:: /images/enterprise/dataset_specific_access.png
   :alt: specific-access
   :align: center

The following permissions are available to each user role:

-  Groups may be granted **Can view**, **Can tag**, **Can edit**, 
   or **Can manage** permissions
-  Members may be granted **Can view**, **Can tag**, **Can edit**, 
   or **Can manage** permissions
-  Collaborators may be granted **Can view**, **Can tag**, 
   or **Can edit** permissions
-  Labelers may be granted **Can view** or **Can tag** permissions
-  Guests may be granted **Can view** permissions

.. note::

   Authorized users can use the "Grant access" workflow to give **Can view**
   , **Can tag**, or **Can edit** access to a dataset to an email address that 
   is not yet user of a FiftyOne Enterprise deployment.

   When the invitation is accepted, the user will become a Guest if the
   **Can view** permission is chosen, a Labeler if the **Can tag** permission is
   chosen, or a Collaborator if a higher permission is chosen, and an Admin can
   upgrade this user to another role if desired via the Team Settings page.

.. _enterprise-no-access:

No access
---------

If a user has no access to a dataset, the dataset will not appear in the user's
search results or show on their dataset listing page. Any direct links to this
dataset that the user attempts to open will show a 404 page.

.. _enterprise-can-view:

Can view
--------

A user with **Can view** permissions on a dataset can find the dataset from
their dataset listing page.

Users with **Can view** permissions cannot modify the dataset in any way, for
example by adding or removing samples, tags, annotation runs, brain runs, etc.

.. note::

   Members (but not Guests, Labelers, or Collaborators) with **Can view** access
   to a dataset may clone the dataset.

.. _enterprise-can-tag:

Can tag
--------

A user with **Can tag** permissions on a dataset can find the dataset from
their dataset listing page.

Users with **Can tag** permissions can modify sample/label tags but cannot
modify the dataset in any other way.

.. _enterprise-can-edit:

Can edit
--------

A user with **Can edit** permissions on a dataset has all permissions from
**Can view** and, in addition, can modify the dataset, including:

-  Adding, editing, and deleting samples
-  Adding, editing, and deleting tags
-  Adding and deleting annotation runs, brain runs, etc.

.. note::

   Deleting a dataset requires the **Can manage** permission.

.. _enterprise-can-manage:

Can manage
----------

A user with **Can manage** permissions on a dataset has all permissions from
**Can view**, **Can tag**  and **Can edit** and, in addition, can delete the 
dataset and configure the permissions on the dataset of other users.

Remember that all admins can implicitly access and manage all datasets created
on your team's deployment.

.. note::

   Any member who creates a dataset (including cloning an existing dataset or
   view) will be granted **Can manage** permissions on the new dataset.

.. _enterprise-roles-page:

Roles page
__________

Admins can review the actions and permissions available to each user role by
navigating to the "Settings > Security > Roles" page:

.. image:: /images/enterprise/admin_roles_page.png
   :alt: admin-roles-page
   :align: center
