.. _teams-migrations:

Migrations
==========

.. default-role:: code

This page describes how to migrate between FiftyOne Teams versions, both for
admins migrating the core Teams App infrastructure and individual users who
need to install a new version of the Teams Python SDK.

.. _teams-upgrade-python-sdk:

Upgrading your Python SDK
_________________________

Users can upgrade their FiftyOne Teams Python client to the latest version as
follows:

.. code-block:: shell

    pip install --index-url https://${TOKEN}@pypi.fiftyone.ai –-upgrade fiftyone

A specific FiftyOne Teams client version can be installed like so:

.. code-block:: shell

    pip install --index-url https://${TOKEN}@pypi.fiftyone.ai fiftyone==${VERSION}

.. note::

    You can find your `TOKEN` by logging into the FiftyOne Teams App and
    clicking on the :ref:`account icon <teams-python-sdk>` in the upper right.

.. _teams-upgrading:

Upgrading your deployment
_________________________

The basic **admin workflow** for upgrading a FiftyOne Teams deployment is:

-   :ref:`Upgrade <teams-upgrade-python-sdk>` all automated services and
    individual user workflows that use the Teams Python SDK to an appropriate
    SDK version
-   Upgrade your core Teams App infrastructure (via Kubernetes, Docker, etc)
-   Upgrade your database's version, as described below

.. note::

    Contact your Voxel51 CS Engineer for all relevant upgrade information,
    including compatible SDK versions, deployment assets, and upgrade
    assistance.

New FiftyOne Teams versions occasionally introduce data model changes that
require database migrations when upgrading your deployment.

Admins can check a deployment's current version via the Python SDK as shown
below:

.. code-block:: shell

    $ fiftyone migrate --info
    FiftyOne Teams version: 0.7.1
    FiftyOne compatibility version: 0.15.1
    Database version: 0.15.1

    ...

.. note::

    Individual datasets have versions as well. They are lazily upgraded the
    first time they are loaded under a new database version. Often there is no
    migration required, but there could be.

`Unlike open source FiftyOne <https://voxel51.com/docs/fiftyone/user_guide/config.html#database-migrations>`_,
a Teams database is not automatically upgraded when a user connects to the
database with a newer Python client version. Instead, an admin must manually
upgrade your Teams database by installing the newest version of the Teams SDK
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

.. _teams-downgrading:

Downgrading your deployment
___________________________

Admins can also downgrade their FiftyOne Teams deployment to an older version
if necessary.

The steps are the same as :ref:`when upgrading <teams-upgrading>`, except that
you’ll need to know the appropriate database version to migrate down to. Each
version of Teams corresponds to a version of open source FiftyOne called its
"open source compatibility version", and this versioning system is used to set
the database version.

For example, you can downgrade to Teams v0.10 like so:

.. code-block:: shell

    OS_COMPAT_VERSION=0.18.0  # OS compatibility version for Teams v0.10.0

    export FIFTYONE_DATABASE_ADMIN=true
    fiftyone migrate --all -v ${OS_COMPAT_VERSION}

.. note::

    The above command must be run with the **newer SDK version** installed.

.. note::

    Contact your Voxel51 CS engineer if you need to know the open source
    compatibility version for a particular Teams version that you wish to
    downgrade to.
