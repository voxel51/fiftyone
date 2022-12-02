.. _roles-and-permissions:

Roles and permissions
======================

.. default-role:: code

FiftyOne Teams is built for collaboration. Our goal is to make it as easy as possible for engineers, data scientists, and stakeholders to work together on cutting edge computer vision applications. Accordingly, the FiftyOne Teams App gives you the flexibility to configure permissions on the organization and dataset levels, allowing you to share insights at any stage in your workflow.

In this document we'll introduce the basic roles available in the FiftyOne Teams App, and give you the tools you need to customize access to your data.

.. _teams-roles:

Roles
_______

In FiftyOne Teams, there are three basic classes of user, with distinct default levels of access: Admin, Member, and Guest.

.. _teams-admin:

Admin
------

In FiftyOne Teams, an Admin is the highest level of access. By default, an Admin has access to all of the organization's datasets, can create new datasets, and can invite or remove members from the team. An Admin can also change others' roles, including promoting Members to Admins.

.. _teams-member:

Member
-------

Like an Admin, a Member can view and access all datasets, and can create new datasets. However, they do not have the ability to invite others - not even Guests.

.. _teams-guest:

Guest
-------

The Guest role in FiftyOne allows for giving specific people access to specific datasets, on a per-dataset basis. A Guest only has access to datasets they have deliberately been given access to. Contrary to what the name of the role may suggest, the Guest role can be granted to members of your organization (e.g. same domain name), or to collaborators or stakeholders outside of the organization. The title "Guest" refers only to access level within FiftyOne Teams.


.. _dataset-permissions:

Dataset-level permissions
__________________________

As an Admin, you can configure permissions for Members and Guests on a per-dataset level in the "Manage" tab for the dataset in the FiftyOne Teams App. The "Default access" option allows you to set a default level of access for all Members. To give individual Members upgraded access, you can use the "Grant Access" button, find the desired Member, and select the access level of interest from the dropdown. 

To give a non-Member access to a dataset, you must first invite them as a Guest on the Team Settings page and, once they accept the invite, grant them access to the dataset following the same procedure as for Members.




