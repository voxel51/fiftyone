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

   You must be :ref:`connecting via API <teams-api-connection>` (not directly
   to MongoDB) in order to use Management SDK methods.

.. _teams-sdk-api-reference:

API Reference
_____________

Connection Methods
------------------

.. automodule:: fiftyone.management.connection
   :members: test_api_connection, reload_connection

API Key Management Methods
--------------------------

.. automodule:: fiftyone.management.api_key
   :members:
   :undoc-members:

Dataset Permission Management Methods
-------------------------------------

.. automodule:: fiftyone.management.dataset
   :members:
   :undoc-members:

Organization Settings Methods
-----------------------------

.. automodule:: fiftyone.management.organization
   :members:
   :undoc-members:

Plugin Management Methods
-------------------------

.. automodule:: fiftyone.management.plugin
   :members:
   :undoc-members:

User Management Methods
-----------------------

.. automodule:: fiftyone.management.users
   :members:
   :undoc-members:
