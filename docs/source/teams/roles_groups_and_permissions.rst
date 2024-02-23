.. _teams-roles-groups-and-permissions:

Roles, groups and permissions
=====================

.. default-role:: code

FiftyOne Teams is engineered to foster collaboration, streamlining the process for teams of engineers, data scientists, and stakeholders to join forces in crafting high-quality datasets and computer vision models.

To this end, FiftyOne Teams offers robust tools to configure user roles, groups, and fine-grained permissions, enhancing your team's ability to collaborate securely and efficiently, both internally and with external partners, throughout your projects.

A key aspect of FiftyOne Teams is its ability to manage user permissions at scale through the use of groups. This feature empowers organizations to efficiently administer access rights across large teams, ensuring that the right people have the appropriate level of access to datasets and tools, corresponding to their roles and responsibilities within the organization.

This page provides a primer on the fundamental user roles, group-based management, and permissions architecture in FiftyOne Teams, designed to facilitate a scalable and secure collaborative environment.

.. _teams-roles:

Roles
_____

FiftyOne Teams has four user roles: Admin, Member, Collaborator, and Guest.

Admins can access user management features by clicking on their account icon in
the upper-right of the FiftyOne Teams App and navigating to the
"Settings > Team > Users" page:

.. image:: /images/teams/admin_team_users_page.png
   :alt: admin-team-users-page
   :align: center

Admins can invite new users by clicking on "Invite people", as shown below.
Invited users will receive an email invitation with a link to accept the
invitation.

.. note::

   Invited users may login using any identity provider that has been enabled
   on your deployment. Contact your Voxel51 CS engineer for more information
   about configuring IdPs.

.. image:: /images/teams/user_invitation.png
   :alt: user-invitation
   :align: center

.. _teams-admin:

Admin
-----

Admins have full access to all of an organization's datasets and can
create, edit, and delete any dataset.

Admins can also invite or remove users from the organization and change any
other user's roles, including promoting/demoting users to admins.

.. _teams-member:

Member
------

Members can create new datasets and can be granted any desired level of
permission on existing datasets. Members may also have a
:ref:`default access level <teams-default-access>` to datasets that use this
feature.

Members do not have the ability to see or manage an organization's users.

.. _teams-collaborator:

Collaborator
------------

Collaborators only have access to datasets to which they have been specifically
granted access (a dataset's
:ref:`default access level <teams-default-access>` does not apply to
Collaborators), and they may only be granted **Can view** or **Can edit**
access to datasets.

Collaborators cannot create new datasets, clone existing datasets, or view
other users of the deployment. Collaborators may export datasets to which
they've been granted access.

.. _teams-guest:

Guest
-----

Guests only have access to datasets to which they have been specifically
granted access (a dataset's
:ref:`default access level <teams-default-access>` does not apply to Guests),
and they may only be granted **Can view** access to datasets.

Guests cannot create new datasets, clone existing datasets, export datasets, or
view other users of the deployment.

.. _teams-user-groups:

Groups
___________

User groups in FiftyOne Teams allow organization admins to manage a collection of users as a single entity. This simplifies the process of assigning permissions to multiple users, making it more efficient to control access to datasets.

Admins can manage groups through the "Settings > Team > Groups" page. Each group can be given specific dataset access permissions, which apply to all users within the group (except for guests).

.. image:: /images/teams/admin_team_groups_page.png
   :alt: admin-team-groups-page
   :align: center

Admins can create a new group by clicking on "Create group" and then adding users to the group by clicking on "Add users".

.. image:: /images/teams/admin_add_users_to_team.png
   :alt: admin-team-add-users-to-team
   :align: center

.. note::

   Guests cannot be granted permissions through groups.

.. _teams-permissions:

Permissions
___________

Admins and users with the **Can manage** permission on a dataset can configure
a dataset's permissions under the dataset's
:ref:`Manage tab <teams-managing-datasets>` in the FiftyOne Teams App.

In FiftyOne Teams, dataset permissions for a user are determined by the highest level of access they receive from either their group's permissions or individual permissions assigned to them. This tiered permissions system is designed to facilitate management at scale:

-  Admins implicitly have full access to all datasets
-  Members have the dataset's
   :ref:`default access level <teams-default-access>`
-  Users may be granted :ref:`specific access <teams-specific-access>` to the
   dataset

.. _teams-default-access:

Default access
--------------

All datasets have a default access level, which defines a minimum permission
level that all Members have on the dataset.

A dataset's default access level can be set to **No access**, **Can view**,
**Can edit**, or **Can manage** as shown below:

.. image:: /images/teams/dataset_default_access.png
   :alt: default-access
   :align: center

.. note::

   Default access level only applies to Members. Guests and Collaborators must
   be granted :ref:`specific access <teams-specific-access>` to datasets.

   Guests cannot be granted permissions through groups.

.. _teams-specific-access:

People and groups with access
------------------

Authorized users can grant specific access to a dataset using the "People and groups with
access" section shown below. 

To give access to an existing user or group, simply click "Share" button on the top right. A list of users with access to the dataset is shown. Click "Add User" or "Add Group" to grant access to a new user or group.

.. image:: /images/teams/share_dataset.png
   :alt: specific-access
   :align: center

.. image:: /images/teams/dataset_specific_access.png
   :alt: specific-access
   :align: center

The following permissions are available to each user role:

-  Groups may be granted **Can view**, **Can edit**, or **Can manage** permissions
-  Members may be granted **Can view**, **Can edit**, or **Can manage**
   permissions
-  Collaborators may be granted **Can view** or **Can edit** permissions
-  Guests may be granted **Can view** permissions

.. note::

   Authorized users can use the "Grant access" workflow to give **Can view**
   or **Can edit** access to a dataset to an email address that is not yet a
   user of a FiftyOne Teams deployment.

   When the invitation is accepted, the user will become a Guest or
   Collaborator (depending on whether **Can view** or **Can edit** access was
   granted, respectively), and an Admin can upgrade this user to another role
   if desired via the Team Settings page. Guests cannot be granted permissions through user groups.

.. _teams-no-access:

No access
---------

If a user has no access to a dataset, the dataset will not appear in the user's
search results or show on their dataset listing page. Any direct links to this
dataset that the user attempts to open will show a 404 page.

.. _teams-can-view:

Can view
--------

A user with **Can view** permissions on a dataset can find the dataset from
their dataset listing page.

Users with **Can view** permissions cannot modify the dataset in any way, for
example by adding or removing samples, tags, annotation runs, brain runs, etc.

.. note::

   Members (but not Guests or Collaborators) with **Can view** access to a
   dataset may clone the dataset.

.. _teams-can-edit:

Can edit
--------

A user with **Can edit** permissions on a dataset has all permissions from
**Can view** and, in addition, can modify the dataset, including:

-  Adding, editing, and deleting samples
-  Adding, editing, and deleting tags
-  Adding and deleting annotation runs, brain runs, etc.

.. note::

   Deleting a dataset requires the **Can manage** permission.

.. _teams-can-manage:

Can manage
----------

A user with **Can manage** permissions on a dataset has all permissions from
**Can view** and **Can edit** and, in addition, can delete the dataset and
configure the permissions on the dataset of other users.

Remember that all admins can implicitly access and manage all datasets created
on your team's deployment.

.. note::

   Any member who creates a dataset (including cloning an existing dataset or
   view) will be granted **Can manage** permissions on the new dataset.
