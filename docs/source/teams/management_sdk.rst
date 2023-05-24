.. _teams-management-sdk:

Teams Management SDK
===========================

.. default-role:: code

Being able to do the same things in the UI as in Python code is
one of the big reasons we love FiftyOne!

There are specific operations that only exist for FiftyOne Teams,
such as management functions for: users, organization invitations,
dataset permissions, plugins, and API keys.

Setup
___________________
In order to use the FiftyOne Teams management SDK, you'll have to
configure your Python environment to connect to the API endpoint of
your Teams deployment. See :ref:`Configuring an API Connection
<configuring-api-connection>` for information and instructions.


.. _teams-sdk-api-reference:

API Reference
______________

Connection Methods
-------------------

.. automodule:: fiftyone.management.connection
   :members: test_api_connection, reload_connection


API Key Management Methods
---------------------------

.. automodule:: fiftyone.management.api_key
   :members:
   :undoc-members:

Dataset Permission Management Methods
-------------------------------------

.. automodule:: fiftyone.management.dataset
   :members:
   :undoc-members:

Organization Settings Methods
------------------------------

.. automodule:: fiftyone.management.organization
   :members:
   :undoc-members:

Plugin Management Methods
-------------------------------------
.. automodule:: fiftyone.management.plugin
   :members:
   :undoc-members:

User Management Methods
-----------------------

.. automodule:: fiftyone.management.users
   :members:
   :undoc-members:
