.. _upgrading-downgrading:

Upgrading and downgrading
===========================

.. default-role:: code

.. _install-new-python-version:

Installing new Python client version
_____________________________________

Users can upgrade their FiftyOne Teams Python client to the latest version as follows:

.. code-block:: shell

	pip install --index-url https://${TOKEN}@pypi.fiftyone.ai –-upgrade fiftyone

A specific FiftyOne Teams client version can be installed like so:

.. code-block:: shell

	pip install --index-url https://${TOKEN}@pypi.fiftyone.ai fiftyone==${VERSION}


.. _upgrading-fiftyone-teams:

Upgrading FiftyOne Teams
_____________________________________

New FiftyOne Teams versions occasionally introduce data model changes that require database migrations when you upgrade. You can check your deployment's current version via the ``fiftyone migrate`` command:

.. code-block:: shell

	$ fiftyone migrate --info
	FiftyOne Teams version: 0.7.1
	FiftyOne compatibility version: 0.15.1
	Database version: 0.15.1

.. note::

	Individual datasets have versions as well. They are lazily upgraded the first time they are loaded under a new database version. Often there is no migration required, but there could be.

`Unlike open source FiftyOne <https://voxel51.com/docs/fiftyone/user_guide/config.html#database-migrations>`_, a Teams database’s version is not automatically upgraded when a user connects to the database with a newer Teams Python client version. Instead, you must manually upgrade your Teams database by assuming admin privileges and then running a ``fiftyone migrate`` command, as shown below:

.. code-block:: shell

	export FIFTYONE_DATABASE_ADMIN=true

	# Option 1: update the database version only
	fiftyone migrate

	# Option 2: migrate the database and all datasets
	fiftyone migrate --all

.. note::

	Once the database version is upgraded, all users must upgrade their Python client to the corresponding version. Any connections from older Teams Python clients will be refused and an informative error message will be displayed.

.. _downgrading-fiftyone-teams:

Downgrading FiftyOne Teams
_____________________________________

If you need to downgrade to an older version of FiftyOne Teams for any reason, you can do so.

Since new releases occasionally introduce backwards-incompatible changes to the data model, you must use the ``fiftyone migrate`` command to perform any necessary downward database migrations **before installing the older version of FiftyOne Teams**.

To do this, you’ll need to know the appropriate database version to migrate down to. Each version of Teams corresponds to a version of open source FiftyOne called its “open source compatibility version”, and this versioning system is used to set the Teams database version.

You can view this information for your current setup via the the ``fiftyone migrate`` command:

.. code-block:: shell

	$ fiftyone migrate --info
	FiftyOne Teams version: 0.7.1
	FiftyOne compatibility version: 0.15.1
	Database version: 0.15.1

In order to perform the downgrade, you’ll need to assume admin database privileges by setting the ``FIFTYONE_DATABASE_ADMIN`` environment variable.

For example, you can downgrade to Teams v0.6.7 like so:

.. code-block:: shell

	TEAMS_VERSION=0.6.7       # Teams version
	OS_COMPAT_VERSION=0.14.3  # OS compatibility version for Teams v0.6.7

	export FIFTYONE_DATABASE_ADMIN=true

	fiftyone migrate --all -v ${OS_COMPAT_VERSION}
	pip install --index-url https://${TOKEN}@pypi.fiftyone.ai fiftyone==${TEAMS_VERSION}

Contact Voxel51 if you need to know the open source compatibility version for a particular Teams version that you wish to downgrade to.




