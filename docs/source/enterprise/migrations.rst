.. _enterprise-migrations:

Migrations
==========

.. default-role:: code

This page describes how to migrate between FiftyOne Enterprise versions, both
for :ref:`admins <enterprise-upgrading>` migrating the core FiftyOne Enterprise
infrastructure and :ref:`individual users <enterprise-upgrade-python-sdk>` who
need to install a new version of the FiftyOne Enterprise Python SDK.

Refer to :ref:`this section <enterprise-migrating-datasets>` to see how to
migrate existing datasets from FiftyOne Open Source to FiftyOne Enterprise.

.. _enterprise-upgrade-python-sdk:

Upgrading your Python SDK
_________________________

Users can upgrade their FiftyOne Enterprise Python client to the latest version
as follows:

.. code-block:: shell

    pip install --index-url https://${TOKEN}@pypi.fiftyone.ai --upgrade fiftyone

A specific FiftyOne Enterprise client version can be installed like so:

.. code-block:: shell

    pip install --index-url https://${TOKEN}@pypi.fiftyone.ai fiftyone==${VERSION}

.. note::

    You can find your `TOKEN` by logging into the FiftyOne Enterprise App and
    clicking on the :ref:`account icon <enterprise-python-sdk>` in the upper
    right.

.. _enterprise-upgrading:

Upgrading your deployment
_________________________

The basic **admin workflow** for upgrading a FiftyOne Enterprise deployment is:

-   :ref:`Upgrade <enterprise-upgrade-python-sdk>` all automated services and
    individual user workflows that use the FiftyOne Enterprise Python SDK to an
    appropriate SDK version
-   Upgrade your core FiftyOne Enterprise infrastructure (via Kubernetes,
    Docker, etc)
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

`Unlike FiftyOne Open Source  <https://voxel51.com/docs/fiftyone/user_guide/config.html#database-migrations>`_,
a FiftyOne Enterprise database is not automatically upgraded when a user
connects to the database with a newer Python client version. Instead, an admin
must manually upgrade your database by installing the newest version of the
FiftyOne Enterprise SDK locally, assuming admin privileges, and running the
following command:

Beginning with FiftyOne Enterprise `v2.14.0`, there is a new migration tool
which is designed specifically for Enterprise deployments. It is similar in use
to the existing `fiftyone migrate` command, but does not come packaged with the
FiftyOne distribution by default.

Installing the Enterprise Migration Tool
________________________________________

Install the `fiftyone-migrator` package:

.. code-block:: shell

    pip install fiftyone-migrator \
      --extra-index-url=https://${TOKEN}@pypi.fiftyone.ai


Configuring the Enterprise Migration Tool
_________________________________________

The Enterprise Migration Tool requires the following environment variables to be
defined where it is run:

-   `CAS_DATABASE_URI` - The database URI used by CAS
-   `CAS_DATABASE_NAME` - The database name used by CAS
-   `FIFTYONE_DATABASE_URI` - The database URI used by FiftyOne
-   `FIFTYONE_DATABASE_NAME` - The database name used by FiftyOne


Using the Enterprise Migration Tool
___________________________________

**IMPORTANT**: As with any database migration, Voxel51 **strongly** recommends
backing up your database prior to migrating.
While many precautions are taken to mitigate the risk of data corruption,
data migration always carries a risk of introducing unintended modifications.

The enterprise migration tool allows migrating each of the enterprise services:

-   `datasets` - Migrate core datasets; this is equivalent to the existing
    `fiftyone migrate` command
-   `enterprise` - Migrate enterprise-specific dataset features
-   `cas` - Migrate the Centralized Authentication Service (CAS)
-   `hub` - Migrate the enterprise API

Each of these services can be selectively included or excluded from migration.

.. code-block:: shell

    export FIFTYONE_DATABASE_ADMIN=true

    # Migrate all enterprise services to the most current state
    fiftyone-migrator migrate
    
    # Migrate all enterprise services to a specific version
    fiftyone-migrator migrate 2.15.0

    # Migrate specific services
    fiftyone-migrator migrate --include enterprise
    
    # Migrate all-but specific services
    fiftyone-migrator migrate --exclude cas hub    

.. note::

    Once the database is upgraded, all users must upgrade their Python SDK to a
    compatible version. Any connections from incompatible Python clients will
    be refused and an informative error message will be displayed.

.. _enterprise-downgrading:

Reverting a Migration with the Enterprise Migration Tool
________________________________________________________

Migrations done with the Enterprise Migration Tool are designed to be
bidirectional. In the event that you need to revert a migration, simply
provide the version which you want to restore.

.. code-block:: shell

    # Migrate from v2.12.0 to v2.13.0
    fiftyone-migrator migrate 2.13.0
    
    # Oops, need to revert this migration!
    # Migrate from v2.13.0 to v2.12.0
    fiftyone-migrator migrate 2.12.0

Downgrading your deployment without the Enterprise Migration Tool
_________________________________________________________________

**For migrations done prior to FiftyOne Enterprise v2.14.0 and the Enterprise Migration Tool**

Admins can also downgrade their FiftyOne Enterprise deployment to an older
version if necessary.

The steps are the same as :ref:`when upgrading <enterprise-upgrading>`, except
that you’ll need to know the appropriate database version to migrate down to.
Each version of FiftyOne Enterprise corresponds to a version of FiftyOne Open
Source  called its "open source compatibility version", and this versioning
system is used to set the database version.

For example, you can downgrade to FiftyOne Enterprise v0.10 like so:

.. code-block:: shell

    OS_COMPAT_VERSION=0.18.0  # OS compatibility version for Enterprise v0.10.0

    export FIFTYONE_DATABASE_ADMIN=true
    fiftyone migrate --all -v ${OS_COMPAT_VERSION}

.. note::

    The above command must be run with the **newer SDK version** installed.

.. note::

    Contact your Voxel51 support team if you need to know the open source
    compatibility version for a particular FiftyOne Enterprise version that
    you wish to downgrade to.

.. _enterprise-migrating-datasets:

Migrating datasets to Enterprise
________________________________

Any datasets that you have created via FiftyOne Open Source can be migrated to
your FiftyOne Enterprise deployment by exporting them in
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

and then re-importing them with the FiftyOne Enterprise SDK connected to your
Enterprise deployment:

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
use the dataset in FiftyOne Enterprise.

If you need to upload the local media to the cloud, the FiftyOne Enterprise SDK
provides a builtin utility for this:

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
