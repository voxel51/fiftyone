.. _enterprise-migrations:

Migrations
==========

.. default-role:: code

This page describes how to migrate between FiftyOne Enterprise versions, both for
:ref:`admins <enterprise-upgrading>` migrating the core Enterprise App infrastructure and
:ref:`individual users <enterprise-upgrade-python-sdk>` who need to install a new
version of the Enterprise Python SDK.

Refer to :ref:`this section <enterprise-migrating-datasets>` to see how to migrate
existing datasets from open source to Enterprise.

.. _enterprise-upgrade-python-sdk:

Upgrading your Python SDK
_________________________

Users can upgrade their FiftyOne Enterprise Python client to the latest version as
follows:

.. code-block:: shell

    pip install --index-url https://${TOKEN}@pypi.fiftyone.ai --upgrade fiftyone

A specific FiftyOne Enterprise client version can be installed like so:

.. code-block:: shell

    pip install --index-url https://${TOKEN}@pypi.fiftyone.ai fiftyone==${VERSION}

.. note::

    You can find your `TOKEN` by logging into the FiftyOne Enterprise App and
    clicking on the :ref:`account icon <enterprise-python-sdk>` in the upper right.

.. _enterprise-upgrading:

Upgrading your deployment
_________________________

The basic **admin workflow** for upgrading a FiftyOne Enterprise deployment is:

-   :ref:`Upgrade <enterprise-upgrade-python-sdk>` all automated services and
    individual user workflows that use the Enterprise Python SDK to an appropriate
    SDK version
-   Upgrade your core Enterprise App infrastructure (via Kubernetes, Docker, etc)
-   Upgrade your database's version, as described below

.. note::

    Contact your Voxel51 CS Engineer for all relevant upgrade information,
    including compatible SDK versions, deployment assets, and upgrade
    assistance.

New FiftyOne Enterprise versions occasionally introduce data model changes that
require database migrations when upgrading your deployment.

Admins can check a deployment's current version via the Python SDK as shown
below:

.. code-block:: shell

    $ fiftyone migrate --info
    FiftyOne Enterprise version: 0.7.1
    FiftyOne compatibility version: 0.15.1
    Database version: 0.15.1

    ...

.. note::

    Individual datasets have versions as well. They are lazily upgraded the
    first time they are loaded under a new database version. Often there is no
    migration required, but there could be.

`Unlike open source FiftyOne <https://voxel51.com/docs/fiftyone/user_guide/config.html#database-migrations>`_,
a Enterprise database is not automatically upgraded when a user connects to the
database with a newer Python client version. Instead, an admin must manually
upgrade your Enterprise database by installing the newest version of the Enterprise SDK
locally, assuming admin privileges, and running the command shown below:

.. code-block:: shell

    export FIFTYONE_DATABASE_ADMIN=true

    # Option 1: update the database version only (datasets lazily migrated on load)
    fiftyone migrate

    # Option 2: migrate the database and all datasets
    fiftyone migrate --all

.. note::

    Once the database is upgraded, all users must upgrade their Python SDK to a
    compatible version. Any connections from incompatible Python clients will
    be refused and an informative error message will be displayed.

.. _enterprise-downgrading:

Downgrading your deployment
___________________________

Admins can also downgrade their FiftyOne Enterprise deployment to an older version
if necessary.

The steps are the same as :ref:`when upgrading <enterprise-upgrading>`, except that
you’ll need to know the appropriate database version to migrate down to. Each
version of Enterprise corresponds to a version of open source FiftyOne called its
"open source compatibility version", and this versioning system is used to set
the database version.

For example, you can downgrade to Enterprise v0.10 like so:

.. code-block:: shell

    OS_COMPAT_VERSION=0.18.0  # OS compatibility version for Enterprise v0.10.0

    export FIFTYONE_DATABASE_ADMIN=true
    fiftyone migrate --all -v ${OS_COMPAT_VERSION}

.. note::

    The above command must be run with the **newer SDK version** installed.

.. note::

    Contact your Voxel51 CS engineer if you need to know the open source
    compatibility version for a particular Enterprise version that you wish to
    downgrade to.

.. _enterprise-migrating-datasets:

Migrating datasets to Enterprise
________________________________

Any datasets that you have created via open source FiftyOne can be migrated to
your Enterprise deployment by exporting them in
:ref:`FiftyOneDataset <FiftyOneDataset-export>` format:

.. code-block:: python
    :linenos:

    # Open source SDK
    import fiftyone as fo

    dataset = fo.load_dataset(...)

    dataset.export(
        export_dir="/tmp/dataset",
        dataset_type=fo.types.FiftyOneDataset,
        export_media=False,
    )

and then re-importing them with the Enterprise SDK connected to your Enterprise
deployment:

.. code-block:: python
    :linenos:

    # Enterprise SDK
    import fiftyone as fo

    dataset = fo.Dataset.from_dir(
        dataset_dir="/tmp/dataset",
        dataset_type=fo.types.FiftyOneDataset,
        persistent=True,
    )

Note that you'll need to update any local filepaths to cloud paths in order to
use the dataset in Enterprise.

If you need to upload the local media to the cloud, the Enterprise SDK provides a
builtin utility for this:

.. code-block:: python
    :linenos:

    import fiftyone.core.storage as fos

    fos.upload_media(
        dataset,
        "s3://path/for/media",
        update_filepaths=True,
        progress=True,
    )

.. note::

    By default, the above method only uploads the media in the ``filepath``
    field of your samples. If your dataset contains other media fields (e.g.
    :ref:`thumbnails <dataset-app-config-media-fields>`,
    :ref:`segmentations <semantic-segmentation>`, or
    :ref:`heatmaps <heatmaps>`) simply run the above command multiple times,
    using the ``media_field`` argument to specify the appropriate fields to
    upload.

    If any media fields use the same filenames as other fields, be sure to
    provide different ``remote_dir`` paths each time you call the above method
    to avoid overwriting existing media.

If the files already exist in cloud buckets, you can manually update the
filepaths on the dataset:

.. code-block:: python
    :linenos:

    cloud_paths = []
    for filepath in dataset.values("filepath"):
        cloud_path = get_cloud_path(filepath)  # your function
        cloud_paths.append(cloud_path)

    dataset.set_values("filepath", cloud_paths)

When you're finished, delete the local export of the dataset:

.. code-block:: python
    :linenos:

    shutil.rmtree("/tmp/dataset")
