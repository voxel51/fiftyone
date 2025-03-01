.. _enterprise-installation:

FiftyOne Enterprise Installation
================================

.. default-role:: code

FiftyOne Enterprise deployments come with a centralized FiftyOne Enterprise App and
database that allows your entire team to collaborate securely on the same
datasets. FiftyOne Enterprise is deployed entirely into your environment, either
on-premises or in a private cloud. Your data never leaves your environment.

FiftyOne Enterprise can be deployed on a wide variety of infrastructure solutions,
including Kubernetes and Docker.

.. note::

    Detailed instructions for the initial FiftyOne Enterprise deployment, along with
    all necessary components, are made available by your Voxel51 CS engineer
    during the onboarding process.

.. _enterprise-python-sdk:

Python SDK
----------

While the :ref:`FiftyOne Enterprise App <enterprise-app>` allows for countless new
App-centric workflows, any existing Python-based workflows that you've fallen
in love with in the open-source version of FiftyOne are still directly
applicable!

FiftyOne Enterprise requires an updated Python SDK, which is a wrapper around the
open-source FiftyOne package that adds new functionality like support for
cloud-backed media.

You can find the installation instructions under the "Install FiftyOne" section
of the Enterprise App by clicking on your user icon in the upper right corner:

.. image:: /images/enterprise/install_fiftyone.png
   :alt: install-enterprise
   :align: center
   :width: 300

There you'll see instructions for installing a ``fiftyone`` package from the
private PyPI server as shown below:

.. code-block:: shell

    pip install --index-url https://${TOKEN}@pypi.fiftyone.ai fiftyone

.. note::

    See :ref:`Installation with Poetry<enterprise-installation-poetry>` if you use
    ``poetry`` instead of ``pip``.

.. note::

   The Enterprise Python package is named ``fiftyone`` and has the same module
   structure as :doc:`fiftyone <../api/fiftyone>`, so any existing scripts you
   built using open source will continue to run after you upgrade!

Next Steps
__________

After installing the Enterprise Python SDK in your virtual environment, you'll need
to configure two things:

*   Your team's :ref:`API connection <enterprise-api-connection>` or
    :ref:`MongoDB connection <configuring-mongodb-connection>`

*   The :ref:`cloud credentials <enterprise-cloud-credentials>` to access your
    cloud-backed media

That's it! Any operations you perform will be stored in a centralized location
and will be available to all users with access to the same datasets in the
Enterprise App or their Python workflows.

.. _enterprise-installation-poetry:

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

    poetry source add --priority=explicit fiftyone-enterprise https://pypi.fiftyone.ai/simple/

Prior to v1.5, you should use the deprecated
`secondary package source. <https://python-poetry.org/docs/1.4/repositories/#secondary-package-sources>`_

.. code-block:: shell

    poetry source add --secondary fiftyone-enterprise https://pypi.fiftyone.ai/simple/

Configure credentials
~~~~~~~~~~~~~~~~~~~~~

.. code-block:: shell

    poetry config http-basic.fiftyone-enterprise ${TOKEN} ""

Alternatively, you can specify the credentials in environment variables.

.. code-block:: shell

    export POETRY_HTTP_BASIC_FIFTYONE_ENTERPRISE_USERNAME="${TOKEN}"
    export POETRY_HTTP_BASIC_FIFTYONE_ENTERPRISE_PASSWORD=""

If you have trouble configuring the credentials, see
`more in the poetry docs here. <https://python-poetry.org/docs/repositories/#configuring-credentials>`_

Add fiftyone dependency
~~~~~~~~~~~~~~~~~~~~~~~

Replace ``X.Y.Z`` with the proper version

.. code-block::

    poetry add --source fiftyone-enterprise fiftyone==X.Y.Z

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
    name = "fiftyone-enterprise"
    url = "https://pypi.fiftyone.ai"
    priority = "explicit"

.. code-block:: toml

    [tool.poetry.dependencies]
    fiftyone = {version = "X.Y.Z", source = "fiftyone-enterprise"}

.. _enterprise-cloud-credentials:

Cloud credentials
-----------------

In order to utilize cloud-backed media functionality of FiftyOne Enterprise, at
least one cloud source must be configured with proper credentials. Below are
instructions for configuring each supported cloud provider for local SDK use
or directly to the Enterprise containers. An admin can also :ref:`configure
credentials for use by all app users <enterprise-cloud-storage-page>`.

.. _enterprise-cors:

Cross-origin resource sharing (CORS)
____________________________________

If your datasets include cloud-backed
:ref:`point clouds <point-cloud-datasets>` or
:ref:`segmentation maps <semantic-segmentation>`, you may need to configure
cross-origin resource sharing (CORS) for your cloud buckets. Details are
provided below for each cloud platform.

Browser caching
_______________

If your datasets include cloud-backed media, we strongly recommend configuring your data
sources to allow for built in browser caching. This will cache signed URL responses
so you don't need to reload assets from your cloud storage between sessions.
Details are provided below for each cloud platform.

.. _enterprise-amazon-s3:

Amazon S3
_________

To work with FiftyOne datasets whose media are stored in Amazon S3, you simply
need to provide
`AWS credentials <https://boto3.amazonaws.com/v1/documentation/api/latest/guide/configuration.html#using-a-configuration-file>`_
to your Enterprise client with read access to the relevant objects and buckets.

You can do this in any of the following ways:

1. Configure/provide AWS credentials in any format supported by the
`boto3 library <https://boto3.amazonaws.com/v1/documentation/api/latest/guide/credentials.html#configuring-credentials>`_.
For example, here are two of the supported methods:

.. code-block:: shell

    # Access key
    export AWS_ACCESS_KEY_ID=...
    export AWS_SECRET_ACCESS_KEY=...
    export AWS_SESSION_TOKEN=... # if applicable
    export AWS_DEFAULT_REGION=...

.. code-block:: shell

    # Web identity provider
    export AWS_ROLE_ARN=...
    export AWS_WEB_IDENTITY_TOKEN_FILE=...
    export AWS_ROLE_SESSION_NAME... #if applicable
    export AWS_DEFAULT_REGION=...

2. Provide AWS credentials on a per-session basis by setting one of the
following sets of environment variables to point to your AWS credentials on
disk:

.. code-block:: shell

    # AWS config file
    export AWS_CONFIG_FILE="/path/to/aws-config.ini"
    export AWS_PROFILE=default  # optional

.. code-block:: shell

    # Shared credentials file
    export AWS_SHARED_CREDENTIALS_FILE="/path/to/aws-credentials.ini"
    export AWS_PROFILE=default  # optional

In the above, the config file should use
`this syntax <https://boto3.amazonaws.com/v1/documentation/api/latest/guide/configuration.html#using-a-configuration-file>`_
and the shared credentials file should use
`this syntax <https://boto3.amazonaws.com/v1/documentation/api/latest/guide/credentials.html#shared-credentials-file>`_.

.. note::

    FiftyOne Enterprise requires either the `s3:ListBucket` or
    `s3:GetBucketLocation` permission in order to access objects in S3 buckets.

    If you wish to use multi-account credentials, your credentials must have
    the `s3:ListBucket` permission, as `s3:GetBucketLocation` does not support
    this.

3. Permanently register AWS credentials on a particular machine by adding the
following keys to your :ref:`media cache config <enterprise-media-cache-config>`:

.. code-block:: json

    {
        "aws_config_file": "/path/to/aws-config.ini",
        "aws_profile": "default"  # optional
    }

If you need to `configure CORS on your AWS buckets <https://docs.aws.amazon.com/AmazonS3/latest/userguide/enabling-cors-examples.html>`_,
here is an example configuration:

.. code-block:: json

    [
        {
            "origin": ["https://fiftyone-enterprise-deployment.yourcompany.com"],
            "method": ["GET", "HEAD"],
            "responseHeader": ["*"],
            "maxAgeSeconds": 86400
        }
    ]

If you would like to take advantage of browser caching you can
`specify cache-control headers on S3 objects <https://docs.aws.amazon.com/whitepapers/latest/build-static-websites-aws/controlling-how-long-amazon-s3-content-is-cached-by-amazon-cloudfront.html#specify-cache-control-headers>`_.
By default S3 does not provide cache-control headers so it will be up to your browser's
heuristics engine to determine how long to cache the object.

.. _enterprise-google-cloud:

Google Cloud Storage
____________________

To work with FiftyOne datasets whose media are stored in Google Cloud Storage,
you simply need to provide `credentials <https://cloud.google.com/docs/authentication>`_
to your Enterprise client with read access to the relevant objects and buckets.

You can do this in any of the following ways:

1. Configure
`application default credentials <https://cloud.google.com/docs/authentication/application-default-credentials>`_
in a manner supported by Google Cloud, such as:

- `Using the gcloud CLI <https://cloud.google.com/docs/authentication/application-default-credentials#personal>`_
- `Attaching a service account to your Google Cloud resource <https://cloud.google.com/docs/authentication/application-default-credentials#attached-sa>`_

2. Provide GCS credentials on a per-session basis by setting the following
environment variables to point to your GCS credentials on disk:

.. code-block:: shell

    export GOOGLE_APPLICATION_CREDENTIALS="/path/to/gcp-credentials.json"

3. Permanently register GCS credentials on a particular machine by adding the
following keys to your :ref:`media cache config <enterprise-media-cache-config>`:

.. code-block:: json

    {
        "google_application_credentials": "/path/to/gcp-credentials.json"
    }

In the above, the credentials file can contain any format supported by
`google.auth.load_credentials_from_file() <https://google-auth.readthedocs.io/en/master/reference/google.auth.html#google.auth.load_credentials_from_file>`_,
which includes a service account key, stored authorized user credentials, or
external account credentials.

If you need to `configure CORS on your GCP buckets <https://cloud.google.com/storage/docs/using-cors>`_,
here is an example configuration:

.. code-block:: json

    [
        {
            "origin": ["https://fiftyone-enterprise-deployment.yourcompany.com"],
            "method": ["GET", "HEAD"],
            "responseHeader": ["*"],
            "maxAgeSeconds": 3600
        }
    ]

If you would like to take advantage of browser caching you can
`specify cache-control headers on GCP content <https://cloud.google.com/storage/docs/metadata#cache-control>`_.
By default GCP sets the max-age=0 seconds meaning no caching will occur.

.. _enterprise-azure:

Microsoft Azure
_______________

To work with FiftyOne datasets whose media are stored in Azure Storage, you
simply need to provide
`Azure credentials <https://learn.microsoft.com/en-us/azure/storage/blobs/authorize-data-operations-cli>`_
to your Enterprise client with read access to the relevant objects and containers.

You can do this in any of the following ways:

1. Provide your Azure credentials in any manner recognized by
`azure.identity.DefaultAzureCredential <https://learn.microsoft.com/en-us/python/api/azure-identity/azure.identity.defaultazurecredential?view=azure-python>`_

2. Provide your Azure credentials on a per-session basis by setting any group
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

3. Provide Azure credentials on a per-session basis by setting the following
environment variables to point to your Azure credentials on disk:

.. code-block:: shell

    export AZURE_CREDENTIALS_FILE=/path/to/azure-credentials.ini
    export AZURE_PROFILE=default  # optional

4. Permanently register Azure credentials on a particular machine by adding the
following keys to your :ref:`media cache config <enterprise-media-cache-config>`:

.. code-block:: json

    {
        "azure_credentials_file": "/path/to/azure-credentials.ini",
        "azure_profile": "default"  # optional
    }

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

If you would like to take advantage of browser caching you can
`specify cache-control headers on Azure blobs <https://learn.microsoft.com/en-us/azure/cdn/cdn-manage-expiration-of-blob-content#setting-cache-control-headers-by-using-azure-powershell>`_.
By default Azure does not provide cache-control headers so it will be up to your browser's
heuristics engine to determine how long to cache the object.

.. _enterprise-minio:

MinIO
_____

To work with FiftyOne datasets whose media are stored in
`MinIO <https://min.io/>`_, you simply need to provide the credentials to your
Enterprise client with read access to the relevant objects and buckets.

You can do this in any of the following ways:

1. Provide your MinIO credentials on a per-session basis by setting the
individual environment variables shown below:

.. code-block:: shell

    export MINIO_ACCESS_KEY=...
    export MINIO_SECRET_ACCESS_KEY=...
    export MINIO_ENDPOINT_URL=...
    export MINIO_ALIAS=...  # optional
    export MINIO_REGION=...  # if applicable

2. Provide MinIO credentials on a per-session basis by setting the following
environment variables to point to your MinIO credentials on disk:

.. code-block:: shell

    export MINIO_CONFIG_FILE=/path/to/minio-config.ini
    export MINIO_PROFILE=default  # optional

3. Permanently register MinIO credentials on a particular machine by adding the
following keys to your :ref:`media cache config <enterprise-media-cache-config>`:

.. code-block:: json

    {
        "minio_config_file": "/path/to/minio-config.ini",
        "minio_profile": "default"  # optional
    }

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

If you would like to take advantage of browser caching you can
`specify cache-control headers on MinIO content using the metadata field of the put_object API <https://min.io/docs/minio/linux/developers/python/API.html>`_.
By default Minio does not provide cache-control headers so it will be up to your browser's
heuristics engine to determine how long to cache the object.

.. _enterprise-extra-kwargs:

Extra client arguments
______________________

Configuring credentials following the instructions above is almost always
sufficient for FiftyOne Enterprise to properly utilize them. In rare cases where the
cloud provider client needs non-default configuration, you can add extra client
kwargs via the :ref:`media cache config <enterprise-media-cache-config>`:

.. code-block:: json

    {
        "extra_client_kwargs": {
            "azure": {"extra_kwarg": "value"},
            "gcs": {"extra_kwarg": "value"},
            "minio": {"extra_kwarg": "value"},
            "s3": {"extra_kwarg": "value"}
        }
    }

Provider names and the class that extra kwargs are passed to:

.. raw:: html

    <ul class="simple">
        <li> <strong>azure</strong>: <code class="docutils literal notranslate> <span class="pre">azure.identity.DefaultAzureCredential</span></code> </li>
        <li> <strong>gcs</strong>: <code class="docutils literal notranslate> <span class="pre">google.cloud.storage.Client</span></code> </li>
        <li> <strong>minio</strong>: <code class="docutils literal notranslate> <span class="pre">botocore.config.Config</span></code> </li>
        <li> <strong>s3</strong>: <code class="docutils literal notranslate> <span class="pre">botocore.config.Config</span></code> </li>
    </ul>

.. _enterprise-cloud-storage-page:

Cloud storage page
------------------

Admins can also configure cloud credentials via the Settings > Cloud storage
page.

Credentials configured via this page are stored (encrypted) in the Enterprise
database, rather than needing to be configured through environment variables in
your Enterprise deployment.

.. note::

    Any credentials configured via environment variables in your deployment
    will not be displayed in this page.

To upload a new credential, click the ``Add credential`` button:

.. image:: /images/enterprise/cloud_creds_add_btn.png
    :alt: cloud-creds-add-credentials-button
    :align: center

This will open a modal that you can use to add a credential for any of the
available providers:

.. image:: /images/enterprise/cloud_creds_modal_blank.png
    :alt: blank-cloud-creds-modal
    :align: center

After the appropriate files or fields are populated, click ``Save credential``
to store the (encrypted) credential.

As depicted in the screenshot above, a credential can optionally be restricted
to a specific list of bucket(s):

-   If one or more buckets are provided, the credentials are
    **bucket-specific credentials** that will only be used to read/write media
    within the specified bucket(s)
-   If no buckets are provided, the credentials are **default credentials**
    that will be used whenever trying to read/write any media for the provider
    that does not belong to a bucket with bucket-specific credentials

.. note::

    Bucket-specific credentials are useful in situations where you cannot or
    do not wish to provide a single set of credentials to cover all buckets
    that your team plans to use within a given cloud storage provider.

    When providing bucket-specific credentials, you may either provide bucket
    names like ``my-bucket``, or you can provide fully-qualified buckets like
    ``s3://my-bucket`` and
    ``https://voxel51.blob.core.windows.net/my-container``.

Alternatively, credentials can be updated programmatically with the
:meth:`add_cloud_credentials() <fiftyone.management.cloud_credentials.add_cloud_credentials>`
method in the Management SDK.

Any cloud credentials uploaded via this method will automatically be used by
the Enterprise UI when any user attempts to load media associated with the
appropriate provider or specific bucket.

.. note::

    By default, Enterprise servers refresh their credentials every 120 seconds, so
    you may need to wait up to two minutes after modifying your credentials via
    this page in order for the changes to take effect.

.. note::

    Users cannot access stored credentials directly, either via the Enterprise UI or
    by using the Enterprise SDK locally. The credentials are only decrypted and
    used internally by the Enterprise servers.
