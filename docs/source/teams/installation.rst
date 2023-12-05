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

There you'll see instructions for installing a ``fiftyone`` package from the
private PyPI server as shown below:

.. code-block:: shell

    pip install --index-url https://{$TOKEN}@pypi.fiftyone.ai fiftyone

.. note::

    See :ref:`Installation with Poetry<teams-installation-poetry>` if you use
    ``poetry`` instead of ``pip``.

.. note::

   The Teams Python package is named ``fiftyone`` and has the same module
   structure as :doc:`fiftyone <../api/fiftyone>`, so any existing scripts you
   built using open source will continue to run after you upgrade!

Next Steps
__________

After installing the Teams Python SDK in your virtual environment, you'll need
to configure two things:

*   Your team's :ref:`API connection <teams-api-connection>` or
    :ref:`MongoDB connection <configuring-mongodb-connection>`

*   The :ref:`cloud credentials <teams-cloud-credentials>` to access your
    cloud-backed media

That's it! Any operations you perform will be stored in a centralized location
and will be available to all users with access to the same datasets in the
Teams App or their Python workflows.

.. _teams-installation-poetry:

Installation with Poetry
________________________
If you  are using `poetry <https://python-poetry.org/>`_ to install your
dependencies rather than ``pip``, you will need to follow instructions in
`the docs for installing from a private repository. <https://python-poetry.org/docs/repositories/#installing-from-private-package-sources>`_
The two key points are specifying the additional private source and declaring
that the ``fiftyone`` module should be found there and not the default PyPI
location.

Add source
~~~~~~~~~~

In poetry v1.5, it is recommended to use an
`explicit package source. <https://python-poetry.org/docs/repositories/#explicit-package-sources>`_

.. code-block:: shell

    poetry source add --priority=explicit fiftyone-teams https://pypi.fiftyone.ai/simple/

Prior to v1.5, you should use the deprecated
`secondary package source. <https://python-poetry.org/docs/1.4/repositories/#secondary-package-sources>`_

.. code-block:: shell

    poetry source add --secondary fiftyone-teams https://pypi.fiftyone.ai/simple/

Configure credentials
~~~~~~~~~~~~~~~~~~~~~
.. code-block:: shell

    poetry config http-basic.fiftyone-teams ${TOKEN} ""

Alternatively, you can specify the credentials in environment variables.

.. code-block:: shell

    export POETRY_HTTP_BASIC_FIFTYONE_TEAMS_USERNAME="${TOKEN}"
    export POETRY_HTTP_BASIC_FIFTYONE_TEAMS_PASSWORD=""

If you have trouble configuring the credentials, see
`more in the poetry docs here. <https://python-poetry.org/docs/repositories/#configuring-credentials>`_

Add fiftyone dependency
~~~~~~~~~~~~~~~~~~~~~~~
Replace ``X.Y.Z`` with the proper version

.. code-block::

    poetry add --source fiftyone-teams fiftyone==X.Y.Z

.. note::

    Due to an `unresolved misalignment <https://github.com/python-poetry/poetry/issues/4046>`_
    with ``poetry`` and a FiftyOne dependency, ``kaleido``, you must add it
    to your own dependencies as well:

    .. code-block::

        poetry add kaleido==0.2.1

You should then see snippets in the ``pyproject.toml`` file like the following
(the ``priority`` line will be different for ``poetry<v1.5``):

.. code-block:: toml

    [[tool.poetry.source]]
    name = "fiftyone-teams"
    url = "https://pypi.fiftyone.ai"
    priority = "explicit"

.. code-block:: toml

    [tool.poetry.dependencies]
    fiftyone = {version = "X.Y.Z", source = "fiftyone-teams}

.. _teams-cloud-credentials:

Cloud credentials
-----------------

.. _teams-cors:

Cross-Origin Resource Sharing (CORS)
____________________________________

If your datasets include cloud-backed
:ref:`point clouds <point-cloud-datasets>` or
:ref:`segmentation maps <semantic-segmentation>`, you may need to configure
cross-origin resource sharing (CORS) for your cloud buckets. Details are
provided below for each cloud platform.

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

If you need to `configure CORS on your AWS buckets <https://docs.aws.amazon.com/AmazonS3/latest/userguide/enabling-cors-examples.html>`_,
here is an example configuration:

.. code-block:: json

    [
        {
            "origin": ["https://fiftyone-teams-deployment.yourcompany.com"],
            "method": ["GET", "HEAD"],
            "responseHeader": ["*"],
            "maxAgeSeconds": 86400
        }
    ] 

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

If you need to `configure CORS on your GCP buckets <https://cloud.google.com/storage/docs/using-cors>`_,
here is an example configuration:

.. code-block:: json

    [
        {
            "AllowedHeaders": [
                "*"
            ],
            "AllowedMethods": [
                "GET",
                "HEAD",
            ],
            "AllowedOrigins": [
                "https://fiftyone-teams-deployment.yourcompany.com"
            ],
            "ExposeHeaders": [
                "x-amz-server-side-encryption",
                "x-amz-request-id",
                "x-amz-id-2"
            ],
            "MaxAgeSeconds": 3000
        }
    ]

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

Cloud Credentials Settings Page
_______________________________

Credentials can also be configured via the Settings page of Teams. Note that
only users with the Administrator role have access to this page.

From the Settings page, navigate to ``Cloud storage``

This page lists all of the credentials that have been added to the Teams database
via the UI.

.. note::

    Credentials provided via environment variables to local machines
    or directly to deployed containers will not be displayed in this menu.

.. image:: /images/teams/cloud_creds_add_btn.png
    :alt: cloud-creds-add-credentials-button
    :align: center

To provide a new credential to users, click the ``Add credential`` button. This will
bring up a modal that gives you options to add credentials for the four providers
described above (GCP, AWS, Azure, and MinIO).

.. image:: /images/teams/cloud_creds_modal_blank.png
    :alt: blank-cloud-creds-modal
    :align: center
    :width: 50%


For each of the providers, the appropriate options are listed for fields to populate.

+--------------+--------------------------+
| Provider     | Configuration options    |
+==============+==========================+
| Google Cloud | - JSON file              |
+--------------+--------------------------+
| AWS          | - ``.ini`` file          |
|              | - Access Keys and region |
+--------------+--------------------------+
| MinIO        | - ``.ini`` file          |
|              | - Access Keys and region |
+--------------+--------------------------+
| Azure        | - ``.ini`` file          |
|              | - Account Keys           |
|              | - Connection string      |
|              | - Client Secret fields   |
+--------------+--------------------------+

After the files or fields are populated, you can click ``Save credential``. This will encrypt
the credential data and store it in your Teams database.

Once stored, the appropriate credentials will be dynamically and automatically used
when attempting to load media for the associated provider. Users cannot select
credentials they want to use at a given time.

.. note::

    Users cannot access the stored credentials. They will not know which ones are being used,
    and the credentials are only decrypted when they are used directly in the Fiftyone Teams
    core SDK.

.. note::

    Any deployed Teams servers have an internal credentials cache which refreshes every 120 seconds.
    Therefore the maximum possible lag between uploading a credential and seeing that
    credential being used is 120 seconds.

.. warning::

    Unlike :ref:`dataset permissions <teams-roles-and-permissions>`, all cloud
    credentials are globally scoped and
    available for all users. This means that if a user of a Fiftyone Teams
    deployment tries to access media that is available based on the credentials
    provided, then that user will be able to see the media.

Cloud Credentials Bucket Prefixes
_________________________________

.. versionadded:: Teams 1.5.0

Cloud credentials loaded through the App can optionally supply
a comma-delimited list of bucket names that are to be associated with the credential.

Providing an empty list of bucket names (leaving the field blank) will create a default
set of credentials that will be used if no other bucket-scoped credentials match. 

In the following example, it is assumed that the credentials being supplied were
appropriately created with the provider.

For example, if you have cloud media across three buckets: ``bucketA``, ``bucketB``, and
``bucketC``, you can provide credentials for that provider with no bucket names. This will act
as the default set of credentials for that provider and will be used when users try to 
access media in any of those buckets.

If an Administrator then uploads a second set of credentials for the same provider and includes
``bucketD`` in the bucket prefix list, that set of credentials will be used when a user
tries to access media in the ``bucketD`` bucket. Media in the ``bucketA``, ``bucketB`` and ``bucketC`` buckets
will still be available via the default credential.

Additionally, an Administrator could upload a set of credentials for ``bucketE,bucketF,bucketG``, and
the same pattern of behavior would follow when a user tries to access media in one of those
three buckets.

Finally, it is possible to only upload bucket-scoped credentials without a default. Doing this
would mean that users trying to load any media that is not included in the buckets that have
credentials will not be able to interact with that media.

As an example, say an Administrator removes the default credentials.

If a user tries to access media in ``bucketA``, ``bucketB`` or ``bucketC``, it will not load, as
none of the credentials provided (there are only bucket-scoped credentials remaining) have 
permissions to access that bucket. However, buckets D-G would still be accessible.
