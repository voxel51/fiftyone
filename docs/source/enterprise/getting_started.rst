.. _enterprise-getting-started:

Getting Started with FiftyOne Enterprise
========================================
.. default-role:: code

This guide provides comprehensive instructions to successful upload your first dataset to FiftyOne Enterprise (FOE). 

Upload Cloud Credentials to your Deployment
-------------------------------------------

.. default-role:: code
Configure cloud credentials to enable rendering of cloud-backed media within FiftyOne Enterprise.

.. image:: /images/enterprise/getting_started_cloud_creds.gif
   :alt: getting-started-cloud-creds
   :align: center

Create a dataset via the SDK 
-----------------------------

Set Cloud Credentials Locally
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Next, configure the appropriate environment variables for your cloud provider within your local environment

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

Install the FiftyOne Enterprise Python SDK
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

1. Navigate to the **Settings** page in the FiftyOne Enterprise UI
2. Select the **API** tab  
3. Copy and execute the provided bash command to install the SDK in your virtual environment

.. image:: /images/enterprise/getting_started_install_sdk.gif
   :alt: getting-started-install-sdk
   :align: center

Connect to Your Deployment
~~~~~~~~~~~~~~~~~~~~~~~~~~

To establish a connection between the FiftyOne Enterprise Python SDK and your deployment, configure the ``FIFTYONE_API_KEY`` and ``FIFTYONE_API_URI`` environment variables. For detailed setup instructions, refer to the `API Connection Documentation <https://voxel51.com/docs/fiftyone/api/>`_.

Verify that your API connection is working correctly using the following method:

.. code-block:: python

   import fiftyone.management as fom  # if this fails, you may have the open-source SDK installed

   fom.test_api_connection()  # API connection succeeded

 
You can use ``fiftyone.config`` to debug and verify your configuration:

.. code-block:: python

   import fiftyone as fo

   print(fo.config)

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

Improve app performance by computing sample metadata:

.. code-block:: python

   dataset.compute_metadata()

Verify all samples have metadata by running the following:

.. code-block:: python

   len(dataset.exists("metadata", False))  # Should be 0
.. note::
   For video datasets, ensure ffmpeg is installed to enable metadata computation.

Create a dataset via the UI 
-----------------------------
Install the IO Plugin 
~~~~~~~~~~~~~~~~~~~~~
The IO plugin allows you to import data from your cloud storage buckets directly. The IO plugin can be downloaded from the following `repository <https://github.com/voxel51/fiftyone-plugins/tree/main/plugins/io>`_. Zip the folder and upload it to the Plugin section of the **Settings** page.

.. note::
   To install plugins to your deployment, you must have admin privileges and also set your deployment to be in Dedicated Plugins mode. It is also highly recommended to add Delegated Operators to your deployment.

.. image:: /images/enterprise/getting_started_install_io_plugin.gif
   :alt: getting-started-install-sdk
   :align: center

Import Your Dataset
~~~~~~~~~~~~~~~~~~~
Schedule the **import_samples**  operator to import your dataset from your cloud storage bucket.

.. image:: /images/enterprise/getting_started_import_samples.gif
   :alt: getting-started-install-sdk
   :align: center

Compute Metadata
~~~~~~~~~~~~~~~~
To improve app performance, compute sample metadata by scheduling the **compute_metadata** operator as a delegated operation.

.. image:: /images/enterprise/getting_started_schedule_compute_metadata.gif
   :alt: getting-started-compute-metadata
   :align: center