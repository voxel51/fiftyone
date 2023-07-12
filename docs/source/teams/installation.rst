.. _teams-installation:

FiftyOne Teams Installation
===========================

.. default-role:: code

FiftyOne Teams deployments come with a centralized FiftyOne Teams App and
database that allows your entire team to collaborate securely on the same
datasets. FiftyOne Teams is deployed entirely into your environment, either
on-premises or in a private cloud. Your data never leaves your environment.

FiftyOne Teams can be deployed on a wide variety of infrastructure solutions,
including Kubernetes and Docker.

.. note::

    Detailed instructions for the initial FiftyOne Teams deployment, along with
    all necessary components, are made available by your Voxel51 CS engineer
    during the onboarding process.

    This page focuses on SDK installation for technical users that wish to
    interact with their team's dataests via Python.

.. _teams-python-sdk:

Python SDK
----------

While the :ref:`FiftyOne Teams App <teams-app>` allows for countless new
App-centric workflows, any existing Python-based workflows that you've fallen
in love with in the open-source version of FiftyOne are still directly
applicable!

FiftyOne Teams requires an updated Python SDK, which is a wrapper around the
open-source FiftyOne package that adds new functionality like support for
cloud-backed media.

You can find the installation instructions under the "Install FiftyOne" section
of the Teams App by clicking on your user icon in the upper right corner:

.. image:: /images/teams/install_fiftyone.png
   :alt: install-teams
   :align: center
   :width: 300

There you'll see instructions for installing a `fiftyone` package from the
private PyPI server as shown below:

.. code-block:: shell

    pip install --index-url https://{$TOKEN}@pypi.fiftyone.ai fiftyone

.. note::

   The Teams Python package is named `fiftyone` and has the same module
   structure as :doc:`fiftyone <../api/fiftyone>`, so any existing scripts you
   built using open source will continue to run after you upgrade!

**Next Steps**

After installing the Teams Python SDK in your virtual environment, you'll need
to configure two things:

*   Your team's :ref:`API connection <teams-api-connection>` or
    :ref:`MongoDB connection <configuring-mongodb-connection>`

*   The :ref:`cloud credentials <teams-cloud-credentials>` to access your
    cloud-backed media

That's it! Any operations you perform will be stored in a centralized location
and will be available to all users with access to the same datasets in the
Teams App or their Python workflows.

.. _teams-cloud-credentials:

Cloud credentials
-----------------

.. _teams-amazon-s3:

Amazon S3
_________

To work with FiftyOne datasets whose media are stored in Amazon S3, you simply
need to provide
`AWS credentials <https://boto3.amazonaws.com/v1/documentation/api/latest/guide/configuration.html#using-a-configuration-file>`_
to your Teams client with read access to the relevant objects and buckets.

You can do this in any of the following ways:

1. Configure/provide AWS credentials in accordance with the
`boto3 <https://boto3.amazonaws.com/v1/documentation/api/latest/guide/credentials.html#configuring-credentials>`_
python library.

2. Permanently register AWS credentials on a particular machine by adding the
following keys to your :ref:`media cache config <teams-media-cache-config>`:

.. code-block:: json

    {
        "aws_config_file": "/path/to/aws-config.ini",
        "aws_profile": "default"  # optional
    }

In the above, the `.ini` file should use the syntax of the
`boto3 configuration file <https://boto3.amazonaws.com/v1/documentation/api/latest/guide/configuration.html#using-a-configuration-file>`_.

.. note::

    FiftyOne Teams requires either the `s3:ListBucket` or
    `s3:GetBucketLocation` permission in order to access objects in S3 buckets.

    If you wish to use multi-account credentials, your credentials must have
    the `s3:ListBucket` permission, as `s3:GetBucketLocation` does not support
    this.

.. _teams-google-cloud:

Google Cloud Storage
____________________

To work with FiftyOne datasets whose media are stored in Google Cloud Storage,
you simply need to provide
`service account credentials <https://cloud.google.com/iam/docs/service-accounts>`_
to your Teams client with read access to the relevant objects and buckets.

You can register GCP credentials on a particular machine by adding the
following key to your :ref:`media cache config <teams-media-cache-config>`:

.. code-block:: json

    {
        "google_application_credentials": "/path/to/gcp-service-account.json"
    }

.. _teams-azure:

Microsoft Azure
_______________

To work with FiftyOne datasets whose media are stored in Azure Storage, you
simply need to provide
`Azure credentials <https://learn.microsoft.com/en-us/azure/storage/blobs/authorize-data-operations-cli>`_
to your Teams client with read access to the relevant objects and containers.

You can do this in any of the following ways:

1. Permanently register Azure credentials on a particular machine by adding the
following keys to your :ref:`media cache config <teams-media-cache-config>`:

.. code-block:: json

    {
        "azure_credentials_file": "/path/to/azure-credentials.ini",
        "azure_profile": "default"  # optional
    }

2. Provide Azure credentials on a per-session basis by setting the following
environment variables to point to your Azure credentials on disk:

.. code-block:: shell

    export AZURE_CREDENTIALS_FILE=/path/to/azure-credentials.ini
    export AZURE_PROFILE=default  # optional

3. Provide your Azure credentials on a per-session basis by setting any group
of environment variables shown below:

.. code-block:: shell

    # Option 1
    export AZURE_STORAGE_CONNECTION_STRING=...
    export AZURE_ALIAS=...  # optional

.. code-block:: shell

    # Option 2
    export AZURE_STORAGE_ACCOUNT=...
    export AZURE_STORAGE_KEY=...
    export AZURE_ALIAS=...  # optional

.. code-block:: shell

    # Option 3
    export AZURE_STORAGE_ACCOUNT=...
    export AZURE_CLIENT_ID=...
    export AZURE_CLIENT_SECRET=...
    export AZURE_TENANT_ID=...
    export AZURE_ALIAS=...  # optional

4. Provide your Azure credentials in any manner recognized by
`azure.identity.DefaultAzureCredential <https://learn.microsoft.com/en-us/python/api/azure-identity/azure.identity.defaultazurecredential?view=azure-python>`_

In the options above, the `.ini` file should have syntax similar to one of
the following:

.. code-block:: shell

    [default]
    conn_str = ...
    alias = ...  # optional

.. code-block:: shell

    [default]
    account_name = ...
    account_key = ...
    alias = ...  # optional

.. code-block:: shell

    [default]
    account_name = ...
    client_id = ...
    secret = ...
    tenant = ...
    alias = ...  # optional

When populating samples with Azure Storage filepaths, you can either specify
paths by their full URL:

.. code-block:: python

    filepath = "https://${account_name}.blob.core.windows.net/container/path/to/object.ext"

    # For example
    filepath = "https://voxel51.blob.core.windows.net/test-container/image.jpg"

or, if you have defined an alias in your config, you may instead prefix the
alias:

.. code-block:: python

    filepath = "${alias}://container/path/to/object.ext"

    # For example
    filepath = "az://test-container/image.jpg"

.. note::

    If you use a
    `custom Azure domain <https://learn.microsoft.com/en-us/azure/storage/blobs/storage-custom-domain-name?tabs=azure-portal>`_,
    you can provide it by setting the
    `AZURE_STORAGE_ACCOUNT_URL` environment variable or by including the
    `account_url` key in your credentials `.ini` file.

.. _teams-minio:

MinIO
_____

To work with FiftyOne datasets whose media are stored in
`MinIO <https://min.io/>`_, you simply need to provide the credentials to your
Teams client with read access to the relevant objects and buckets.

You can do this in any of the following ways:

1. Permanently register MinIO credentials on a particular machine by adding the
following keys to your :ref:`media cache config <teams-media-cache-config>`:

.. code-block:: json

    {
        "minio_config_file": "/path/to/minio-config.ini",
        "minio_profile": "default"  # optional
    }

2. Provide MinIO credentials on a per-session basis by setting the following
environment variables to point to your MinIO credentials on disk:

.. code-block:: shell

    export MINIO_CONFIG_FILE=/path/to/minio-config.ini
    export MINIO_PROFILE=default  # optional

3. Provide your MinIO credentials on a per-session basis by setting the
individual environment variables shown below:

.. code-block:: shell

    export MINIO_ACCESS_KEY=...
    export MINIO_SECRET_ACCESS_KEY=...
    export MINIO_ENDPOINT_URL=...
    export MINIO_ALIAS=...  # optional
    export MINIO_REGION=...  # if applicable

In the options above, the `.ini` file should have syntax similar the following:

.. code-block:: shell

    [default]
    access_key = ...
    secret_access_key = ...
    endpoint_url = ...
    alias = ...  # optional
    region = ...  # if applicable

When populating samples with MinIO filepaths, you can either specify paths by
prefixing your MinIO endpoint URL:

.. code-block:: python

    filepath = "${endpoint_url}/bucket/path/to/object.ext"

    # For example
    filepath = "https://voxel51.min.io/test-bucket/image.jpg"

or, if you have defined an alias in your config, you may instead prefix the
alias:

.. code-block:: python

    filepath = "${alias}://bucket/path/to/object.ext"

    # For example
    filepath = "minio://test-bucket/image.jpg"
