.. _enterprise-management-sdk:

Enterprise Management SDK
=========================

.. default-role:: code

One of FiftyOne's core design principles is that you should be able to do
everything *programmatically* if you want.

To this end, the `fiftyone.management` module provides Enterprise-specific
methods for managing users, invitations, dataset permissions, plugins, API
keys, and more.

.. note::

   You must use an :ref:`API connection <enterprise-api-connection>`
   (not a direct MongoDB connection) in order to use Management SDK methods.

.. _enterprise-sdk-api-reference:

API reference
-----------

.. _enterprise-sdk-connections:

Connections
-----------

.. autoapimodule:: fiftyone.management.connection
   :members: test_api_connection, reload_connection

.. _enterprise-sdk-api-keys:

API keys
--------

.. autoapimodule:: fiftyone.management.api_key
   :members:
   :undoc-members:

.. _enterprise-sdk-cloud-credentials:

Cloud credentials
-----------------

.. autoapimodule:: fiftyone.management.cloud_credentials
   :members:
   :undoc-members:

.. _enterprise-sdk-dataset-permissions:

Dataset permissions
-------------------

.. autoapimodule:: fiftyone.management.dataset
   :members:
   :undoc-members:

.. _enterprise-sdk-organization-settings:

Organization settings
---------------------

.. autoapimodule:: fiftyone.management.organization
   :members:
   :undoc-members:

.. _enterprise-sdk-plugin-management:

Plugin management
-----------------

.. autoapimodule:: fiftyone.management.plugin
   :members:
   :undoc-members:

.. _enterprise-sdk-orchestrator-management:

Orchestrator management
-----------------------

.. autoapimodule:: fiftyone.management.orchestrator
   :members:
   :undoc-members:

.. _enterprise-sdk-secrets:

Secrets
-------

.. autoapimodule:: fiftyone.management.secret
   :members:
   :undoc-members:

.. _enterprise-sdk-snapshots:

Snapshots
---------

.. autoapimodule:: fiftyone.management.snapshot
   :members:
   :undoc-members:

.. _enterprise-sdk-user-management:

User management
---------------

.. autoapimodule:: fiftyone.management.users
   :members:
   :undoc-members:

.. _enterprise-sdk-group-management:

Group management
----------------

.. autoapimodule:: fiftyone.management.user_groups
   :members:
   :undoc-members:
