.. _teams-roles-and-permissions:

Roles and permissions
=====================

.. default-role:: code

FiftyOne Teams is built for collaboration. Our goal is to make it as easy as
possible for engineers, data scientists, and stakeholders to work together to
build high quality datasets and computer vision models.

Accordingly, FiftyOne Teams gives you the flexibility to configure user roles
and fine-grained permissions, so that you can safely and securly collaborate
both inside and outside your organization at all stages of your workflows.

Here we'll introduce the basic roles available in the FiftyOne Teams, and
give you the tools you need to customize access to your data.

.. _teams-roles:

Roles
_____

FiftyOne Teams has three basic user roles: **Admin**, **Member**, and **Guest**

.. image:: ../images/teams/roles.png
   :alt: roles
   :align: center

.. _teams-admin:

Admin
-----

Admins have full access to all of the organization's datasets, and can
create/delete any dataset. Admins can also invite or remove users from the
organization and change other user's roles, including promoting/demoting users
to admins.

.. _teams-member:

Member
------

Members can create datasets and can be granted any desired level of permissions
on existing datasets. Members may also have a
:ref:`default access level <teams-default-access-level>` to datasets that use
this feature.

Members do not have the ability to see or manage the organization's users.

.. note::

   Members with **Can manage** permissions on a dataset may invite a **Guest**
   to access (only) that dataset by sending an email invitation.

.. _teams-guest:

Guest
-----

Guests only have access to datasets to which they have been specifically
granted access (a dataset's
:ref:`default access level <teams-default-access-level>` does not apply to
guests), and they may only be granted **Can view** access to datasets.

Guests cannot create new datasets, clone existing datasets, or view other users
of the deployment.

.. _dataset-permissions:

Dataset-level permissions
_________________________

As an Admin, you can configure permissions for Members and Guests on a
per-dataset level in the "Manage" tab for the dataset in the FiftyOne Teams
App. The "Default access" option allows you to set a default level of access
for all Members. To give individual Members upgraded access, you can use the
"Grant Access" button, find the desired Member, and select the access level of
interest from the dropdown.

To give a non-Member access to a dataset, you must first invite them as a Guest
on the Team Settings page and, once they accept the invite, grant them access
to the dataset following the same procedure as for Members.

The available permissions level on a dataset are: No Access, View, Edit,
Manage.

.. image:: ../images/teams/dataset_permissions.png
   :alt: permissions
   :align: center

.. _teams-no-access-permission:

No Access
---------

If a user has no access to a dataset, then the dataset will not appear in the
user's search results or show on their dataset listing page. Any direct links
to this dataset that the user attempts to open will show a 404 page.

.. _teams-view-permission:

View
----

A user with **Can view** access to a dataset can find the dataset from their
dataset listing page, view the dataset,
listing page and view the samples as well as the dataset tags and description.

.. note::

   Members (not guests) with **Can view** access to a dataset may clone
   The user will not be able to modify the dataset, for example by adding or
   removing tags.

If the user is not a Guest, then they will have the ability to clone the
dataset, creating their own copy of it for which they will have manage
permissions.

.. _teams-edit-permission:

Edit
----

A user with **Can edit** permissions on a dataset has all permissions from
**Can view**, and, in addition, can modify the dataset, including:

-  Adding/editing/deleting samples
-  Adding/editing/deleting tags

.. note::

   Deleting a dataset requires the **Can manage** permission.

user with `view` access, except that they will have the ability to modify a
dataset. For example, they can add or remove tags and samples from the dataset.
However, they will not be able to delete it.

.. _teams-manage-permission:

Can manage
----------

A user with **Can manage** permissions on a dataset has all permissions from
**Can view** and **Can edit**, and, in addition, they can delete the dataset
and configure the permissions on the dataset of other users.

.. note::

   Any **Member** who creates a dataset (including cloning an existing dataset
   or view) will be gratned **Can manage** permissions on the new dataset.

   Additionally, all **Admins** can implicitly access and manage all datasets
   created on your team's deployment.
