.. _cloud-credentials:

Cloud credentials
==================

.. default-role:: code


.. _amazon-s3:

Amazon S3
_____________________

To work with FiftyOne datasets whose media are stored in Amazon S3, you simply need to provide `AWS credentials <https://boto3.amazonaws.com/v1/documentation/api/latest/guide/configuration.html#using-a-configuration-file>`_ to your Teams client with read access to the relevant files.

You can do this in any of the following ways:

#. Permanently register AWS credentials on a particular machine by adding the following keys to your media cache config:

	|

    .. code-block:: python

        {
        "aws_config_file": "/path/to/aws-config.ini",
        "aws_profile": "default"  # optional
        }

    In the above, the ``.ini`` file should use the syntax of the `boto3 configuration file <https://boto3.amazonaws.com/v1/documentation/api/latest/guide/configuration.html#using-a-configuration-file>`_.

#. Configure/provide AWS credentials in accordance with the `boto3 <https://boto3.amazonaws.com/v1/documentation/api/latest/guide/credentials.html#configuring-credentials>`_ python library.

.. _google-cloud:

Google Cloud Storage
_____________________

To work with FiftyOne datasets whose media are stored in Google Cloud Storage, you simply need to provide `service account credentials <https://cloud.google.com/iam/docs/service-accounts>`_ to your Teams client with read access to the relevant files. 

You can do this in any of the following ways:

#. Permanently register GCP credentials on a particular machine by adding the following key to your media cache config:
	
	|

    .. code-block:: python

        {
            "google_application_credentials": "/path/to/gcp-service-account.json"
        }

#. Configure/provide GCP credentials in accordance with `Application Default Credentials <https://cloud.google.com/docs/authentication/production#automatically>`_.


.. _minio:

MinIO
_____________________

To work with FiftyOne datasets whose media are stored in `MinIO <https://min.io/>`_, you simply need to provide the credentials to your Teams client with read access to the relevant files.

You can do this in any of the following ways:

#. Permanently register MinIO credentials on a particular machine by adding the following keys to your media cache config:

	|

    .. code-block:: python

        {
            "minio_config_file": "/path/to/minio-config.ini",
            "minio_profile": "default"  # optional
        }

#. Provide MinIO credentials on a per-session basis by setting the following environment variables to point to your MinIO credentials:
	
	|

    .. code-block:: shell

        export MINIO_CONFIG_FILE=/path/to/minio-config.ini
        export MINIO_PROFILE=default  # optional

#. Provide your MinIO credentials on a per-session basis by setting the individual environment variables shown below:

	|

    .. code-block:: shell

        export MINIO_ACCESS_KEY=...
        export MINIO_SECRET_ACCESS_KEY=...
        export MINIO_ENDPOINT_URL=...  
        export MINIO_ALIAS=...  # optional
        export MINIO_REGION=...  # if applicable

    If you combine multiple options above, environment variables will take precedence over JSON config settings.

    |

    In the options above, the ``.ini`` file should have syntax similar the following:

    |

    .. code-block:: shell

        [default]
        access_key = ...
        secret_access_key = ...
        endpoint_url = ...
        alias = ...  # optional
        region = ...  # if applicable


    When creating samples with MinIO-backed media, specify paths by prefixing your endpoint URL:

    |

    .. code-block:: shell
    
        filepath = ${endpoint_url}/bucket/path/to/object.ext

        # For example
        filepath = https://play.min.io/test-bucket/image.jpg


    Or, if you have defined an alias in your config, you may instead prefix the alias:

    |

    .. code-block:: shell

        filepath = ${alias}://bucket/path/to/object.ext

        # For example
        filepath = voxel51://test-bucket/image.jpg



.. _cloud-functions:

AWS Lambda and Google Cloud Functions
____________________________________________


FiftyOne Teams can easily be used in AWS Lambda Functions and Google Cloud Functions.

**Requirements**: we recommend including Teams in your  function’s ``requirements.txt`` file by passing your token as a build environment variable, e.g., ``FIFTYONE_TEAMS_TOKEN`` and then using the syntax below to specify the version of the Teams client to use:

.. code-block:: shell
    
    https://${FIFTYONE_TEAMS_TOKEN}@pypi.fiftyone.ai/packages/fiftyone-0.6.6-py3-none-any.whl

**Runtime**: Lambda/GCFs cannot use services, so you must disable the media the cache by setting the following runtime environment variable:


.. code-block:: shell
    
    FIFTYONE_MEDIA_CACHE_SIZE_BYTES=-1  # disable media cache

From there, you can configure your database URI and any necessary cloud storage credentials via runtime environment variables as you normally would, eg:


.. code-block:: shell
    
    FIFTYONE_DATABASE_URI=mongodb://...



