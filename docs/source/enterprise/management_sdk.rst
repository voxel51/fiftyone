.. _enterprise-management-sdk:

Enterprise Management SDK
=========================

.. default-role:: code

One of FiftyOne's core design principles is that you should be able to do
everything *programmatically* if you want.

To this end, the `fiftyone.management` module provides Enterprise-specific methods
for managing users, invitations, dataset permissions, plugins, API keys, and
more.

.. note::

   You must use an :ref:`API connection <enterprise-api-connection>` (not a direct
   MongoDB connection) in order to use Management SDK methods.

.. _enterprise-sdk-api-reference:

API reference
_____________

.. _enterprise-sdk-connections:

Connections
-----------

.. automodule:: fiftyone.management.connection
   :members: test_api_connection, reload_connection

.. _enterprise-sdk-api-keys:

API keys
--------

.. automodule:: fiftyone.management.api_key
   :members:
   :undoc-members:

.. _enterprise-sdk-cloud-credentials:

Cloud credentials
-----------------

.. automodule:: fiftyone.management.cloud_credentials
   :members:
   :undoc-members:

.. _enterprise-sdk-dataset-permissions:

Dataset permissions
-------------------

.. automodule:: fiftyone.management.dataset
   :members:
   :undoc-members:

.. _enterprise-sdk-organization-settings:


Organization settings
---------------------

.. automodule:: fiftyone.management.organization
   :members:
   :undoc-members:

.. _enterprise-sdk-plugin-management:

Plugin management
-----------------

.. automodule:: fiftyone.management.plugin
   :members:
   :undoc-members:

.. _enterprise-sdk-snapshots:

Snapshots
---------

.. automodule:: fiftyone.management.snapshot
   :members:
   :undoc-members:

.. _enterprise-sdk-user-management:

User management
---------------

.. automodule:: fiftyone.management.users
   :members:
   :undoc-members:

.. _enterprise-sdk-group-management:

Group management
----------------

.. automodule:: fiftyone.management.user_groups
   :members:
   :undoc-members:
