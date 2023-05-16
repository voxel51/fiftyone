.. _configuring-api-connection:

Configuring an API connection
-----------------------------

By default, FiftyOne uses a connection to a MongoDB database to work. You can
alternatively configure FiftyOne to connect to a Teams API instance. This
allows for user roles and dataset permissions to be respected. To do so, simply
set the `api_uri` and `api_key`properties of your FiftyOne config.

You can achieve this by adding similar entries to your
`~/.fiftyone/config.json` file:

.. code-block:: json

    {
        "api_uri": "https://api.fiftyone.ai",
        "api_key": YOUR_API_KEY_HERE
    }

or you can set the following environment variable with similar values:

.. code-block:: shell

    export FIFTYONE_API_URI=https://api.fiftyone.ai
    export FIFTYONE_API_KEY=YOUR_API_KEY_HERE