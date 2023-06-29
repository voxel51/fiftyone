.. _teams-management-sdk:

Teams Management SDK
====================

.. default-role:: code

One of FiftyOne's core design principles is that you should be able to do
everything *programmatically* if you want.

To this end, the `fiftyone.management` module provides Teams-specific methods
for managing users, invitations, dataset permissions, plugins, API keys, and
more.

.. note::

   You must use an :ref:`API connection <teams-api-connection>` (not a direct
   MongoDB connection) in order to use Management SDK methods.

.. _teams-sdk-api-reference:

API reference
_____________

.. _teams-sdk-connections:

Connections
-----------

.. automodule:: fiftyone.management.connection
   :members: test_api_connection, reload_connection

.. _teams-sdk-api-keys:

API keys
--------

.. automodule:: fiftyone.management.api_key
   :members:
   :undoc-members:

.. _teams-sdk-dataset-permissions:

Dataset permissions
-------------------

.. automodule:: fiftyone.management.dataset
   :members:
   :undoc-members:

.. _teams-sdk-organization-settings:

Organization settings
---------------------

.. automodule:: fiftyone.management.organization
   :members:
   :undoc-members:

.. _teams-sdk-plugin-management:

Plugin management
-----------------

.. automodule:: fiftyone.management.plugin
   :members:
   :undoc-members:

.. _teams-sdk-user-management:

User management
---------------

.. automodule:: fiftyone.management.users
   :members:
   :undoc-members:
