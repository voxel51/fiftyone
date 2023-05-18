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
