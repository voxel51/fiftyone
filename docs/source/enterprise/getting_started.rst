.. _enterprise-getting-started:

Getting Started with FiftyOne Enterprise
========================================
.. default-role:: code

This guide provides comprehensive instructions to successfully upload your first dataset to FiftyOne Enterprise (FOE).

Upload Cloud Credentials to your Deployment
-------------------------------------------

Configure cloud credentials to enable rendering of cloud-backed media within
FiftyOne Enterprise. This is a one-time setup that only needs to be performed
by an administrator.

.. image:: /images/enterprise/getting_started_cloud_creds.gif
   :alt: getting-started-cloud-creds
   :align: center

Create a dataset via the SDK 
-----------------------------

Install the FiftyOne Enterprise Python SDK
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

1. Navigate to the **Settings** page in the FiftyOne Enterprise UI
2. Select the **API** tab  
3. Copy and execute the provided bash command to install the SDK in your virtual environment

.. image:: /images/enterprise/getting_started_install_sdk.gif
   :alt: getting-started-install-sdk
   :align: center

Working with Video Data
^^^^^^^^^^^^^^^^^^^^^^^
For video datasets, ensure that ffmpeg is installed in your environment to enable video support. You can install ffmpeg using the following command:

.. tabs::

   .. tab:: Ubuntu/Debian

      .. code-block:: bash

         sudo apt-get install ffmpeg

   .. tab:: macOS

      .. code-block:: bash

         brew install ffmpeg

   .. tab:: Windows

      .. code-block:: powershell

         # Using Chocolatey
         choco install ffmpeg


Connect to Your Deployment
~~~~~~~~~~~~~~~~~~~~~~~~~~

To establish a connection between the FiftyOne Enterprise Python SDK and your deployment, configure the ``FIFTYONE_API_KEY`` and ``FIFTYONE_API_URI`` environment variables. For detailed setup instructions, refer to the :ref:`API connection documentation <enterprise-api-connection>`.

Verify that your API connection is working correctly using the following method:

.. code-block:: python

   import fiftyone.management as fom  # if this fails, you may have the open-source SDK installed

   fom.test_api_connection()  # API connection succeeded

You can use ``fiftyone.config`` to verify that you have correctly set the ``FIFTYONE_API_KEY`` and ``FIFTYONE_API_URI`` environment variables:

.. code-block:: python

   import fiftyone as fo

   print(fo.config)



Set Cloud Credentials Locally
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Next, configure the appropriate environment variables for your :ref:`cloud credentials <enterprise-cloud-credentials>` within your local environment

.. tab-set::

   .. tab-item:: AWS

      Set the following environment variables:

      .. code-block:: bash

         export AWS_ACCESS_KEY_ID=...
         export AWS_SECRET_ACCESS_KEY=...
         export AWS_DEFAULT_REGION=...

   .. tab-item:: GCP

      Set the following environment variable:

      .. code-block:: bash

         export GOOGLE_APPLICATION_CREDENTIALS="/path/to/your/service-account-key.json"

   .. tab-item:: Azure

      Set the following environment variables:

      .. code-block:: bash

         export AZURE_STORAGE_ACCOUNT=...
         export AZURE_STORAGE_KEY=...

   .. tab-item:: MinIO

      Set the following environment variables:

      .. code-block:: bash

         export MINIO_ACCESS_KEY_ID=...
         export MINIO_SECRET_ACCESS_KEY=...
         export MINIO_DEFAULT_REGION=...

Learn more about how to interact with cloud-backed media witht the FiftyOne 
Enterprise Python SDK in the :ref:`Cloud Media Guide <enterprise-cloud-media>`.

Create a Dataset and Add Samples
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. tab-set::

   .. tab-item:: AWS S3

      .. code-block:: python

         import fiftyone as fo
         import fiftyone.core.storage as fos

         s3_files = fos.list_files(dirpath="s3://YOUR_BUCKET/YOUR_PREFIX", abs_path=True)
         dataset = fo.Dataset("YOUR_DATASET")
         samples = []

         for s3_uri in s3_files:
             if s3_uri.lower().endswith(".jpeg"):
                 sample = fo.Sample(filepath=s3_uri)
                 samples.append(sample)

         dataset.add_samples(samples)
         dataset.persistent = True  # will render the dataset in the UI

   .. tab-item:: Google Cloud Storage (GCS)

      .. code-block:: python

         import fiftyone as fo
         import fiftyone.core.storage as fos

         gcs_files = fos.list_files(dirpath="gs://YOUR_BUCKET/YOUR_PREFIX", abs_path=True)
         dataset = fo.Dataset("YOUR_DATASET")
         samples = []

         for gcs_uri in gcs_files:
             if gcs_uri.lower().endswith(".jpeg"):
                 sample = fo.Sample(filepath=gcs_uri)
                 samples.append(sample)

         dataset.add_samples(samples)
         dataset.persistent = True
   .. tab-item:: Azure Blob Storage

      .. code-block:: python

         import fiftyone as fo
         import fiftyone.core.storage as fos

         azure_files = fos.list_files(
             dirpath="https://<storage-account>.blob.core.windows.net/<container>/<prefix>",
             abs_path=True
         )
         dataset = fo.Dataset("YOUR_DATASET")
         samples = []

         for azure_uri in azure_files:
             if azure_uri.lower().endswith(".jpeg"):
                 sample = fo.Sample(filepath=azure_uri)
                 samples.append(sample)

         dataset.add_samples(samples)
         dataset.persistent = True     

   .. tab-item:: MinIO

      .. code-block:: python

         import fiftyone as fo
         import fiftyone.core.storage as fos

         minio_files = fos.list_files(
             dirpath="https://minio.example.com/bucket-name/prefix",
             abs_path=True
         )
         dataset = fo.Dataset("YOUR_DATASET")
         samples = []

         for minio_uri in minio_files:
             if minio_uri.lower().endswith(".jpeg"):
                 sample = fo.Sample(filepath=minio_uri)
                 samples.append(sample)

         dataset.add_samples(samples)
         dataset.persistent = True

   

Compute Metadata
~~~~~~~~~~~~~~~~

:meth:`compute_metadata() <fiftyone.core.metadata.compute_metadata>` is a
builtin method that effeciently populates basic metadata such as file size,
image height and width, etc for all of the samples in your dataset. Keeping the
metadata field populated for all samples of your datasets is recommended
because it enables the sample grid's tiling algorithm to run more efficiently

.. code-block:: python

   dataset.compute_metadata()
   sample = dataset.first()
   print(sample.metadata) #shows example metadata for the first sample

Verify all samples have metadata by running the following:

.. code-block:: python

   len(dataset.exists("metadata", False))  # Should be 0


Create a dataset via the UI 
---------------------------

Import Your Dataset
~~~~~~~~~~~~~~~~~~~
Schedule the **import_samples**  operator to import your dataset from your cloud storage bucket.

.. image:: /images/enterprise/getting_started_import_samples.gif
   :alt: getting-started-install-sdk
   :align: center

Compute Metadata
~~~~~~~~~~~~~~~~
**compute_metadata** is an operator that efficiently populates basic
metadata such as file size, image height and width, etc for all of the samples 
in your dataset. Keeping the metadata field populated for all samples of your
datasets is recommended because it enables the sample grid's tiling algorithm
to run more efficiently

.. image:: /images/enterprise/getting_started_schedule_compute_metadata.gif
   :alt: getting-started-compute-metadata
   :align: center

.. note::

    An admin must follow :ref:`these instructions <enterprise-plugins-install>`
    to install the
    `@voxel51/io <https://github.com/voxel51/fiftyone-plugins/blob/main/plugins/
    io/README.md>`_ and `@voxel51/utils <https://github.com/voxel51/
    fiftyone-plugins/blob/main/plugins/
    utils/README.md>`_ plugins in order to perform imports and compute metadata 
    via the Enterprise UI. 