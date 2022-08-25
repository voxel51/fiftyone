.. _configuring-fiftyone:

Configuring FiftyOne
====================

.. default-role:: code

FiftyOne can be configured in various ways. This guide covers the various
options that exist, how to view your current config, and how to customize your
config as desired.

Configuration options
---------------------

FiftyOne supports the configuration options described below:

+-------------------------------+-------------------------------------+-------------------------------+----------------------------------------------------------------------------------------+
| Config field                  | Environment variable                | Default value                 | Description                                                                            |
+===============================+=====================================+===============================+========================================================================================+
| `database_admin`              | `FIFTYONE_DATABASE_ADMIN`           | `True`                        | Whether the client is allowed to trigger database migrations. See                      |
|                               |                                     |                               | :ref:`this section <database-migrations>` for more information.                        |
+-------------------------------+-------------------------------------+-------------------------------+----------------------------------------------------------------------------------------+
| `database_dir`                | `FIFTYONE_DATABASE_DIR`             | `~/.fiftyone/var/lib/mongo`   | The directory in which to store FiftyOne's backing database. Only applicable if        |
|                               |                                     |                               | `database_uri` is not defined.                                                         |
+-------------------------------+-------------------------------------+-------------------------------+----------------------------------------------------------------------------------------+
| `database_name`               | `FIFTYONE_DATABASE_NAME`            | `fiftyone`                    | A name to use for FiftyOne's backing database in your MongoDB instance. The database   |
|                               |                                     |                               | is automatically created if necessary.                                                 |
+-------------------------------+-------------------------------------+-------------------------------+----------------------------------------------------------------------------------------+
| `database_uri`                | `FIFTYONE_DATABASE_URI`             | `None`                        | A `MongoDB URI <https://docs.mongodb.com/manual/reference/connection-string/>`_ to     |
|                               |                                     |                               | specifying a custom MongoDB database to which to connect. See                          |
|                               |                                     |                               | :ref:`this section <configuring-mongodb-connection>` for more information.             |
+-------------------------------+-------------------------------------+-------------------------------+----------------------------------------------------------------------------------------+
| `database_validation`         | `FIFTYONE_DATABASE_VALIDATION`      | `True`                        | Whether to validate the compatibility of database before connecting to it. See         |
|                               |                                     |                               | :ref:`this section <configuring-mongodb-connection>` for more information.             |
+-------------------------------+-------------------------------------+-------------------------------+----------------------------------------------------------------------------------------+
| `dataset_zoo_dir`             | `FIFTYONE_DATASET_ZOO_DIR`          | `~/fiftyone`                  | The default directory in which to store datasets that are downloaded from the          |
|                               |                                     |                               | :ref:`FiftyOne Dataset Zoo <dataset-zoo>`.                                             |
+-------------------------------+-------------------------------------+-------------------------------+----------------------------------------------------------------------------------------+
| `dataset_zoo_manifest_paths`  | `FIFTYONE_ZOO_MANIFEST_PATHS`       | `None`                        | A list of manifest JSON files specifying additional zoo datasets. See                  |
|                               |                                     |                               | :ref:`adding datasets to the zoo <dataset-zoo-add>` for more information.              |
+-------------------------------+-------------------------------------+-------------------------------+----------------------------------------------------------------------------------------+
| `default_dataset_dir`         | `FIFTYONE_DEFAULT_DATASET_DIR`      | `~/fiftyone`                  | The default directory to use when performing FiftyOne operations that                  |
|                               |                                     |                               | require writing dataset contents to disk, such as ingesting datasets via               |
|                               |                                     |                               | :meth:`ingest_labeled_images() <fiftyone.core.dataset.Dataset.ingest_labeled_images>`. |
+-------------------------------+-------------------------------------+-------------------------------+----------------------------------------------------------------------------------------+
| `default_ml_backend`          | `FIFTYONE_DEFAULT_ML_BACKEND`       | `torch`                       | The default ML backend to use when performing operations such as                       |
|                               |                                     |                               | downloading datasets from the FiftyOne Dataset Zoo that support multiple ML            |
|                               |                                     |                               | backends. Supported values are `torch` and `tensorflow`. By default,                   |
|                               |                                     |                               | `torch` is used if `PyTorch <https://pytorch.org>`_ is installed in your               |
|                               |                                     |                               | Python environment, and `tensorflow` is used if                                        |
|                               |                                     |                               | `TensorFlow <http://tensorflow.org>`_ is installed. If no supported backend            |
|                               |                                     |                               | is detected, this defaults to `None`, and any operation that requires an               |
|                               |                                     |                               | installed ML backend will raise an informative error message if invoked in             |
|                               |                                     |                               | this state.                                                                            |
+-------------------------------+-------------------------------------+-------------------------------+----------------------------------------------------------------------------------------+
| `default_batch_size`          | `FIFTYONE_DEFAULT_BATCH_SIZE`       | `None`                        | A default batch size to use when :ref:`applying models to datasets <model-zoo-apply>`. |
+-------------------------------+-------------------------------------+-------------------------------+----------------------------------------------------------------------------------------+
| `default_sequence_idx`        | `FIFTYONE_DEFAULT_SEQUENCE_IDX`     | `%06d`                        | The default numeric string pattern to use when writing sequential lists of             |
|                               |                                     |                               | files.                                                                                 |
+-------------------------------+-------------------------------------+-------------------------------+----------------------------------------------------------------------------------------+
| `default_image_ext`           | `FIFTYONE_DEFAULT_IMAGE_EXT`        | `.jpg`                        | The default image format to use when writing images to disk.                           |
+-------------------------------+-------------------------------------+-------------------------------+----------------------------------------------------------------------------------------+
| `default_video_ext`           | `FIFTYONE_DEFAULT_VIDEO_EXT`        | `.mp4`                        | The default video format to use when writing videos to disk.                           |
+-------------------------------+-------------------------------------+-------------------------------+----------------------------------------------------------------------------------------+
| `default_app_port`            | `FIFTYONE_DEFAULT_APP_PORT`         | `5151`                        | The default port to use to serve the :ref:`FiftyOne App <fiftyone-app>`.               |
+-------------------------------+-------------------------------------+-------------------------------+----------------------------------------------------------------------------------------+
| `default_app_address`         | `FIFTYONE_DEFAULT_APP_ADDRESS`      | `localhost`                   | The default address to use to serve the :ref:`FiftyOne App <fiftyone-app>`. This may   |
|                               |                                     |                               | be either an IP address or hostname. If it's a hostname, the App will listen to all    |
|                               |                                     |                               | IP addresses associated with the name. The default is `localhost`, which means the App |
|                               |                                     |                               | will only listen on the local interface. See :ref:`this page <restricting-app-address>`|
|                               |                                     |                               | for more information.                                                                  |
+-------------------------------+-------------------------------------+-------------------------------+----------------------------------------------------------------------------------------+
| `desktop_app`                 | `FIFTYONE_DESKTOP_APP`              | `False`                       | Whether to launch the FiftyOne App in the browser (False) or as a desktop App (True)   |
|                               |                                     |                               | by default. If True, the :ref:`FiftyOne Desktop App <installing-fiftyone-desktop>`     |
|                               |                                     |                               | must be installed.                                                                     |
+-------------------------------+-------------------------------------+-------------------------------+----------------------------------------------------------------------------------------+
| `do_not_track`                | `FIFTYONE_DO_NOT_TRACK`             | `False`                       | Controls whether UUID based import and App usage events are tracked.                   |
+-------------------------------+-------------------------------------+-------------------------------+----------------------------------------------------------------------------------------+
| `logging_level`               | `FIFTYONE_LOGGING_LEVEL`            | `INFO`                        | Controls FiftyOne's package-wide logging level. Can be any valid ``logging`` level as  |
|                               |                                     |                               | a string: ``DEBUG, INFO, WARNING, ERROR, CRITICAL``.                                   |
+-------------------------------+-------------------------------------+-------------------------------+----------------------------------------------------------------------------------------+
| `model_zoo_dir`               | `FIFTYONE_MODEL_ZOO_DIR`            | `~/fiftyone/__models__`       | The default directory in which to store models that are downloaded from the            |
|                               |                                     |                               | :ref:`FiftyOne Model Zoo <model-zoo>`.                                                 |
+-------------------------------+-------------------------------------+-------------------------------+----------------------------------------------------------------------------------------+
| `model_zoo_manifest_paths`    | `FIFTYONE_MODEL_ZOO_MANIFEST_PATHS` | `None`                        | A list of manifest JSON files specifying additional zoo models. See                    |
|                               |                                     |                               | :ref:`adding models to the zoo <model-zoo-add>` for more information.                  |
+-------------------------------+-------------------------------------+-------------------------------+----------------------------------------------------------------------------------------+
| `module_path`                 | `FIFTYONE_MODULE_PATH`              | `None`                        | A list of modules that should be automatically imported whenever FiftyOne is imported. |
|                               |                                     |                               | See :ref:`this page <custom-embedded-documents>` for an example usage.                 |
+-------------------------------+-------------------------------------+-------------------------------+----------------------------------------------------------------------------------------+
| `requirement_error_level`     | `FIFTYONE_REQUIREMENT_ERROR_LEVEL`  | `0`                           | A default error level to use when ensuring/installing requirements such as third-party |
|                               |                                     |                               | packages. See :ref:`loading zoo models <model-zoo-load>` for an example usage.         |
+-------------------------------+-------------------------------------+-------------------------------+----------------------------------------------------------------------------------------+
| `show_progress_bars`          | `FIFTYONE_SHOW_PROGRESS_BARS`       | `True`                        | Controls whether progress bars are printed to the terminal when performing             |
|                               |                                     |                               | operations such reading/writing large datasets or activiating FiftyOne                 |
|                               |                                     |                               | Brain methods on datasets.                                                             |
+-------------------------------+-------------------------------------+-------------------------------+----------------------------------------------------------------------------------------+
| `timezone`                    | `FIFTYONE_TIMEZONE`                 | `None`                        | An optional timzone string. If provided, all datetimes read from FiftyOne datasets     |
|                               |                                     |                               | will be expressed in this timezone. See :ref:`this section <configuring-timezone>` for |
|                               |                                     |                               | more information.                                                                      |
+-------------------------------+-------------------------------------+-------------------------------+----------------------------------------------------------------------------------------+

Viewing your config
-------------------

You can print your current FiftyOne config at any time via the Python library
and the CLI:

.. tabs::

  .. tab:: Python

    .. code-block:: python

        import fiftyone as fo

        # Print your current config
        print(fo.config)

        # Print a specific config field
        print(fo.config.default_ml_backend)

    .. code-block:: text

        {
            "database_admin": true,
            "database_dir": "~/.fiftyone/var/lib/mongo",
            "database_name": "fiftyone",
            "database_uri": null,
            "database_validation": true,
            "dataset_zoo_dir": "~/fiftyone",
            "dataset_zoo_manifest_paths": null,
            "default_app_config_path": "~/.fiftyone/app_config.json",
            "default_app_port": 5151,
            "default_app_address": null,
            "default_batch_size": null,
            "default_dataset_dir": "~/fiftyone",
            "default_image_ext": ".jpg",
            "default_ml_backend": "torch",
            "default_sequence_idx": "%06d",
            "default_video_ext": ".mp4",
            "desktop_app": false,
            "do_not_track": false,
            "logging_level": "INFO",
            "model_zoo_dir": "~/fiftyone/__models__",
            "model_zoo_manifest_paths": null,
            "module_path": null,
            "requirement_error_level": 0,
            "show_progress_bars": true,
            "timezone": null
        }

        torch

  .. tab:: CLI

    .. code-block:: shell

        # Print your current config
        fiftyone config

        # Print a specific config field
        fiftyone config default_ml_backend

    .. code-block:: text

        {
            "database_admin": true,
            "database_dir": "~/.fiftyone/var/lib/mongo",
            "database_name": "fiftyone",
            "database_uri": null,
            "database_validation": true,
            "dataset_zoo_dir": "~/fiftyone",
            "dataset_zoo_manifest_paths": null,
            "default_app_config_path": "~/.fiftyone/app_config.json",
            "default_app_port": 5151,
            "default_app_address": null,
            "default_batch_size": null,
            "default_dataset_dir": "~/fiftyone",
            "default_image_ext": ".jpg",
            "default_ml_backend": "torch",
            "default_sequence_idx": "%06d",
            "default_video_ext": ".mp4",
            "desktop_app": false,
            "do_not_track": false,
            "logging_level": "INFO",
            "model_zoo_dir": "~/fiftyone/__models__",
            "model_zoo_manifest_paths": null,
            "module_path": null,
            "requirement_error_level": 0,
            "show_progress_bars": true,
            "timezone": null
        }

        torch

.. note::

    If you have customized your FiftyOne config via any of the methods
    described below, printing your config is a convenient way to ensure that
    the changes you made have taken effect as you expected.

Modifying your config
---------------------

You can modify your FiftyOne config in a variety of ways. The following
sections describe these options in detail.

Order of precedence
~~~~~~~~~~~~~~~~~~~

The following order of precedence is used to assign values to your FiftyOne
config settings at runtime:

1. Config changes applied at runtime by directly editing `fiftyone.config`
2. `FIFTYONE_XXX` environment variables
3. Settings in your JSON config (`~/.fiftyone/config.json`)
4. The default config values

Editing your JSON config
~~~~~~~~~~~~~~~~~~~~~~~~

You can permanently customize your FiftyOne config by creating a
`~/.fiftyone/config.json` file on your machine. The JSON file may contain any
desired subset of config fields that you wish to customize.

For example, a valid config JSON file is:

.. code-block:: json

    {
        "default_ml_backend": "tensorflow",
        "show_progress_bars": true
    }

When `fiftyone` is imported, any options from your JSON config are applied,
as per the order of precedence described above.

.. note::

    You can customize the location from which your JSON config is read by
    setting the `FIFTYONE_CONFIG_PATH` environment variable.

Setting environment variables
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

FiftyOne config settings may be customized on a per-session basis by setting
the `FIFTYONE_XXX` environment variable(s) for the desired config settings.

When `fiftyone` is imported, all config environment variables are applied, as
per the order of precedence described above.

For example, you can customize your FiftyOne config in a Terminal session by
issuing the following commands prior to launching your Python interpreter:

.. code-block:: shell

    export FIFTYONE_DEFAULT_ML_BACKEND=tensorflow
    export FIFTYONE_SHOW_PROGRESS_BARS=true

Modifying your config in code
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

You can dynamically modify your FiftyOne config at runtime by editing the
`fiftyone.config` object.

Any changes to your FiftyOne config applied via this manner will immediately
take effect for all subsequent calls to `fiftyone.config` during your current
session.

.. code-block:: python
    :linenos:

    import fiftyone as fo

    fo.config.default_ml_backend = "tensorflow"
    fo.config.show_progress_bars = True

.. _configuring-mongodb-connection:

Configuring a MongoDB connection
--------------------------------

By default, FiftyOne is installed with its own MongoDB database distribution.
This database is managed by FiftyOne automatically as a service that runs
whenever at least one FiftyOne Python client is alive.

Alternatively, you can configure FiftyOne to connect to your own self-managed
MongoDB instance. To do so, simply set the `database_uri` property of your
FiftyOne config to any valid
`MongoDB connection string URI <https://docs.mongodb.com/manual/reference/connection-string/>`_.

You can achieve this by adding the following entry to your
`~/.fiftyone/config.json` file:

.. code-block:: json

    {
        "database_uri": "mongodb://[username:password@]host[:port]"
    }

or you can set the following environment variable:

.. code-block:: shell

    export FIFTYONE_DATABASE_URI=mongodb://[username:password@]host[:port]

If you are running MongoDB with authentication enabled (the `--auth` flag),
FiftyOne must connect as a root user.

You can create a root user with the Mongo shell as follows:

.. code-block:: shell

    mongo --shell
    > use admin
    > db.createUser({user: "username", pwd: passwordPrompt(), roles: ["root"]})

You must also add `?authSource=admin` to your database URI:

.. code-block:: text

    mongodb://[username:password@]host[:port]/?authSource=admin

.. note::

    **Apple Silicon users**: MongoDB does not yet provide a native build for
    Apple Silicon, so you currently must use `dataset_uri` with a MongoDB
    distribution that you have installed yourself.

    Users have reported success
    `installing MongoDB v4.4 on Apple Silicon <https://docs.mongodb.com/manual/tutorial/install-mongodb-on-os-x>`_
    as follows:

    .. code-block:: shell

        brew tap mongodb/brew
        brew install mongodb-community@4.4

Using a different MongoDB version
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

FiftyOne is designed for and distributed with **MongoDB v4.4**.

Users have reported success connecting to MongoDB v5 databases, but if you wish
to do this, you should
`set the feature compatibility version <https://docs.mongodb.com/manual/reference/command/setFeatureCompatibilityVersion>`_
to 4.4 to ensure proper function:

.. code-block:: shell

    mongo --shell
    > db.adminCommand({setFeatureCompatibilityVersion: "4.4"})

If you wish to connect FiftyOne to a MongoDB database whose version is not
explicitly supported, you will also need to set the `database_validation`
property of your FiftyOne config to `False` to suppress a runtime error that
will otherwise occur.

You can achieve this by adding the following entry to your
`~/.fiftyone/config.json` file:

.. code-block:: json

    {
        "database_validation": false
    }

or you can set the following environment variable:

.. code-block:: shell

    export FIFTYONE_DATABASE_VALIDATION=false

Controlling database migrations
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

If you are working with a shared MongoDB database, you can use
:ref:`database admin privileges <database-migrations>` to control which clients
are allowed to migrate the shared database.

Example custom database usage
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

In order to use a custom MongoDB database with FiftyOne, you must manually
start the database before importing FiftyOne. MongoDB provides
`a variety of options <https://docs.mongodb.com/manual/tutorial/manage-mongodb-processes>`_
for this, including running the database as a daemon automatically.

In the simplest case, you can just run `mongod` in one shell:

.. code-block:: shell

    mkdir -p /path/for/db
    mongod --dbpath /path/for/db

Then, in another shell, configure the database URI and launch FiftyOne:

.. code-block:: shell

    export FIFTYONE_DATABASE_URI=mongodb://localhost

.. code-block:: python

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")
    session = fo.launch_app(dataset)

.. _database-migrations:

Database migrations
-------------------

New FiftyOne versions occasionally introduce data model changes that require
database migrations when you :ref:`upgrade <upgrading-fiftyone>` or
:ref:`downgrade <downgrading-fiftyone>`.

By default, database upgrades happen automatically in two steps:

-   **Database**: when you import FiftyOne for the first time using a newer
    version of the Python package, the database's version is automatically
    updated to match your client version
-   **Datasets** are lazily migrated to the current database version on a
    per-dataset basis whenever you load the dataset for the first time using a
    newer version of the FiftyOne package

Database downgrades must be manually performed. See
:ref:`this page <downgrading-fiftyone>` for instructions.

You can use the :ref:`fiftyone migrate <cli-fiftyone-migrate>` command to view
the current versions of your client, database, and datasets:

.. code-block:: shell

    # View your client, database, and dataset versions
    fiftyone migrate --info

.. code-block:: text

    Client version: 0.16.6
    Compatible versions: >=0.16.3,<0.17

    Database version: 0.16.6

    dataset                      version
    ---------------------------  ---------
    bdd100k-validation           0.16.5
    quickstart                   0.16.5
    ...

Restricting migrations
~~~~~~~~~~~~~~~~~~~~~~

You can use the `database_admin` config setting to control whether a client is
allowed to upgrade/downgrade your FiftyOne database. The default is `True`,
which means that upgrades are automatically peformed when you connect to your
database with newer Python client versions.

If you set `database_admin` to `False`, your client will **never** cause the
database to be migrated to a new version. Instead, you'll see the following
behavior:

-   If your client is compatible with the current database version, you will be
    allowed to connect to the database and use FiftyOne
-   If your client is not compatible with the current database version, you
    will see an informative error message when you import the library

You can restrict migrations by adding the following entry to your
`~/.fiftyone/config.json` file:

.. code-block:: json

    {
        "database_admin": false
    }

or by setting the following environment variable:

.. code-block:: shell

    export FIFTYONE_DATABASE_ADMIN=false

.. note::

    A common pattern when working with
    :ref:`custom/shared MongoDB databases <configuring-mongodb-connection>` is
    to adopt a convention that all non-administrators set their
    `database_admin` config setting to `False` to ensure that they cannot
    trigger automatic database upgrades by connecting to the database with
    newer Python client versions.

Coordinating a migration
~~~~~~~~~~~~~~~~~~~~~~~~

If you are working in an environment where multiple services are connecting to
your MongoDB database at any given time, use this strategy to upgrade your
deployment:

1.  Ensure that all clients are running without database admin privileges,
    e.g., by adding this to their `~/.fiftyone/config.json`:

.. code-block:: json

    {
        "database_admin": false
    }

2.  Perform a test upgrade of one client and ensure that it is compatible with
    your current database version:

.. code-block:: shell

    # In a test environment
    pip install --upgrade fiftyone

    # View client's compatibility info
    fiftyone migrate --info

.. code-block:: python

    import fiftyone as fo

    # Convince yourself that the new client can load a dataset
    dataset = fo.load_dataset(...)

3.  Now upgrade the client version used by all services:

.. code-block:: shell

    # In all client environments
    pip install --upgrade fiftyone

4.  Once all services are running the new client version, upgrade the database
    with admin privileges:

.. code-block:: shell

    export FIFTYONE_DATABASE_ADMIN=true

    pip install --upgrade fiftyone
    fiftyone migrate --all

.. note::

    Newly created datasets will always bear the
    :meth:`version <fiftyone.core.dataset.Dataset.version>` of the Python
    client that created them, which may differ from your database's version
    if you are undergoing a migration.

    If the new client's version is not in the compatibility range for the old
    clients that are still in use, the old clients will not be able to load
    the new datasets.

    Therefore, it is recommended to upgrade all clients as soon as possible!

.. _configuring-timezone:

Configuring a timezone
----------------------

By default, FiftyOne loads all datetimes in FiftyOne datasets as naive
`datetime` objects expressed in UTC time.

However, you can configure FiftyOne to express datetimes in a specific timezone
by setting the `timezone` property of your FiftyOne config.

The `timezone` property can be set to any timezone string supported by
`pytz.timezone()`, or `"local"` to use your current local timezone.

For example, you could set the `FIFTYONE_TIMEZONE` environment variable:

.. code-block:: shell

    # Local timezone
    export FIFTYONE_TIMEZONE=local

    # US Eastern timezone
    export FIFTYONE_TIMEZONE=US/Eastern

Or, you can even dynamically change the timezone while you work in Python:

.. code-block:: python
    :linenos:

    from datetime import datetime
    import fiftyone as fo

    sample = fo.Sample(filepath="image.png", created_at=datetime.utcnow())

    dataset = fo.Dataset()
    dataset.add_sample(sample)

    print(sample.created_at)
    # 2021-08-24 20:24:09.723021

    fo.config.timezone = "local"
    dataset.reload()

    print(sample.created_at)
    # 2021-08-24 16:24:09.723000-04:00

.. note::

    The `timezone` setting does not affect the internal database representation
    of datetimes, which are always stored as UTC timestamps.

.. _configuring-fiftyone-app:

Configuring the App
===================

The :ref:`FiftyOne App <fiftyone-app>` can also be configured in various ways.
A new copy of your App config is applied to each |Session| object that is
created when you launch the App. A session's config can be inspected and
modified via the :meth:`session.config <fiftyone.core.session.Session.config>`
property.

.. note::

    For changes to a session's config to take effect in the App, you must call
    :meth:`session.refresh() <fiftyone.core.session.Session.refresh>` or
    invoke another state-updating action such as ``session.view = my_view``.

The FiftyOne App can be configured in the ways described below:

+---------------------------+----------------------------------------+-----------------------------+------------------------------------------------------------------------------------------+
| Config field              | Environment variable                   | Default value               | Description                                                                              |
+===========================+========================================+=============================+==========================================================================================+
| `color_by`                | `FIFTYONE_APP_COLOR_BY`                | `"field"`                   | Whether to color labels by their field name (`"field"`), `label` value (`"label"`), or   |
|                           |                                        |                             | render each instance ID/trajectory index (`"instance"`).                                 |
+---------------------------+----------------------------------------+-----------------------------+------------------------------------------------------------------------------------------+
| `color_pool`              | `FIFTYONE_APP_COLOR_POOL`              | See below                   | A list of browser supported color strings from which the App should draw from when       |
|                           |                                        |                             | drawing labels (e.g., object bounding boxes).                                            |
+---------------------------+----------------------------------------+-----------------------------+------------------------------------------------------------------------------------------+
| `colorscale`              | `FIFTYONE_APP_COLORSCALE`              | `"viridis"`                 | The colorscale to use when rendering heatmaps in the App. See                            |
|                           |                                        |                             | :ref:`this section <heatmaps>` for more details.                                         |
+---------------------------+----------------------------------------+-----------------------------+------------------------------------------------------------------------------------------+
| `grid_zoom`               | `FIFTYONE_APP_GRID_ZOOM`               | `5`                         | The zoom level of the App's sample grid. Larger values result in larger samples (and )   |
|                           |                                        |                             | (thus fewer samples in the grid). Supported values are `{0, 1, ..., 10}`.                |
+---------------------------+----------------------------------------+-----------------------------+------------------------------------------------------------------------------------------+
| `loop_videos`             | `FIFTYONE_APP_LOOP_VIDEOS`             | `False`                     | Whether to loop videos by default in the expanded sample view.                           |
+---------------------------+----------------------------------------+-----------------------------+------------------------------------------------------------------------------------------+
| `multicolor_keypoints`    | `FIFTYONE_APP_MULTICOLOR_KEYPOINTS`    | `False`                     | Whether to independently coloy keypoint points by their index                            |
+---------------------------+----------------------------------------+-----------------------------+------------------------------------------------------------------------------------------+
| `notebook_height`         | `FIFTYONE_APP_NOTEBOOK_HEIGHT`         | `800`                       | The height of App instances displayed in notebook cells.                                 |
+---------------------------+----------------------------------------+-----------------------------+------------------------------------------------------------------------------------------+
| `show_confidence`         | `FIFTYONE_APP_SHOW_CONFIDENCE`         | `True`                      | Whether to show confidences when rendering labels in the App's expanded sample view.     |
+---------------------------+----------------------------------------+-----------------------------+------------------------------------------------------------------------------------------+
| `show_index`              | `FIFTYONE_APP_SHOW_INDEX`              | `True`                      | Whether to show indexes when rendering labels in the App's expanded sample view.         |
+---------------------------+----------------------------------------+-----------------------------+------------------------------------------------------------------------------------------+
| `show_label`              | `FIFTYONE_APP_SHOW_LABEL`              | `True`                      | Whether to show the label value when rendering detection labels in the App's expanded    |
|                           |                                        |                             | sample view.                                                                             |
+---------------------------+----------------------------------------+-----------------------------+------------------------------------------------------------------------------------------+
| `show_skeletons`          | `FIFTYONE_APP_SHOW_SKELETONS`          | `True`                      | Whether to show keypoint skeletons, if available.                                        |
+---------------------------+----------------------------------------+-----------------------------+------------------------------------------------------------------------------------------+
| `show_tooltip`            | `FIFTYONE_APP_SHOW_TOOLTIP`            | `True`                      | Whether to show the tooltip when hovering over labels in the App's expanded sample view. |
+---------------------------+----------------------------------------+-----------------------------+------------------------------------------------------------------------------------------+
| `use_frame_number`        | `FIFTYONE_APP_USE_FRAME_NUMBER`        | `False`                     | Whether to use the frame number instead of a timestamp in the expanded sample view. Only |
|                           |                                        |                             | applicable to video samples.                                                             |
+---------------------------+----------------------------------------+-----------------------------+------------------------------------------------------------------------------------------+

Viewing your App config
-----------------------

You can print your App config at any time via the Python library and the CLI:

.. tabs::

  .. tab:: Python

    .. code-block:: python

        import fiftyone as fo

        # Print your current App config
        print(fo.app_config)

        # Print a specific App config field
        print(fo.app_config.show_attributes)

    .. code-block:: text

        {
            "color_by": "field",
            "color_pool": [
                "#ee0000",
                "#ee6600",
                "#993300",
                "#996633",
                "#999900",
                "#009900",
                "#003300",
                "#009999",
                "#000099",
                "#0066ff",
                "#6600ff",
                "#cc33cc",
                "#777799"
            ],
            "colorscale": "viridis",
            "grid_zoom": 5,
            "loop_videos": false,
            "multicolor_keypoints": false,
            "notebook_height": 800,
            "show_confidence": true,
            "show_index": true,
            "show_label": true,
            "show_skeletons": true,
            "show_tooltip": true,
            "use_frame_number": false
        }

        True

  .. tab:: CLI

    .. code-block:: shell

        # Print your current App config
        fiftyone app config

        # Print a specific App config field
        fiftyone app config show_attributes

    .. code-block:: text

        {
            "color_by": "field",
            "color_pool": [
                "#ee0000",
                "#ee6600",
                "#993300",
                "#996633",
                "#999900",
                "#009900",
                "#003300",
                "#009999",
                "#000099",
                "#0066ff",
                "#6600ff",
                "#cc33cc",
                "#777799"
            ],
            "colorscale": "viridis",
            "grid_zoom": 5,
            "loop_videos": false,
            "multicolor_keypoints": false,
            "notebook_height": 800,
            "show_confidence": true,
            "show_index": true,
            "show_label": true,
            "show_skeletons": true,
            "show_tooltip": true,
            "use_frame_number": false
        }

        True

.. note::

    If you have customized your App config via any of the methods described
    below, printing your config is a convenient way to ensure that the changes
    you made have taken effect as you expected.

Modifying your App config
-------------------------

You can modify your App config in a variety of ways. The following sections
describe these options in detail.

Order of precedence
~~~~~~~~~~~~~~~~~~~

The following order of precedence is used to assign values to your App config
settings at runtime:

1. Config settings of a
   :class:`Session <fiftyone.core.session.Session>` instance in question
2. App config settings applied at runtime by directly editing
   `fiftyone.app_config`
3. `FIFTYONE_APP_XXX` environment variables
4. Settings in your JSON App config (`~/.fiftyone/app_config.json`)
5. The default App config values

Launching the App with a custom config
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

You can launch the FiftyOne App with a customized App config on a one-off basis
via the following pattern:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    # Create a custom App config
    app_config = fo.AppConfig()
    app_config.show_confidence = False
    app_config.show_attributes = False

    session = fo.launch_app(dataset, config=app_config)

You can also configure a live |Session| by editing its
:meth:`session.config <fiftyone.core.session.Session.config>` property and
calling :meth:`session.refresh() <fiftyone.core.session.Session.refresh>` to
apply the changes:

.. code-block:: python
    :linenos:

    # Customize the config of a live Session
    session.config.show_confidence = True
    session.config.show_attributes = True

    # Refresh the session to apply the changes
    session.refresh()

Editing your JSON App config
~~~~~~~~~~~~~~~~~~~~~~~~~~~~

You can permanently customize your App config by creating a
`~/.fiftyone/app_config.json` file on your machine. The JSON file may contain
any desired subset of config fields that you wish to customize.

For example, a valid App config JSON file is:

.. code-block:: json

    {
        "show_confidence": false,
        "show_attributes": false
    }

When `fiftyone` is imported, any options from your JSON App config are applied,
as per the order of precedence described above.

.. note::

    You can customize the location from which your JSON App config is read by
    setting the `FIFTYONE_APP_CONFIG_PATH` environment variable.

Setting App environment variables
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

App config settings may be customized on a per-session basis by setting the
`FIFTYONE_APP_XXX` environment variable(s) for the desired App config settings.

When `fiftyone` is imported, all App config environment variables are applied,
as per the order of precedence described above.

For example, you can customize your App config in a Terminal session by
issuing the following commands prior to launching your Python interpreter:

.. code-block:: shell

    export FIFTYONE_APP_SHOW_CONFIDENCE=false
    export FIFTYONE_APP_SHOW_ATTRIBUTES=false

Modifying your App config in code
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

You can dynamically modify your App config at runtime by editing the
`fiftyone.app_config` object.

Any changes to your App config applied via this manner will immediately
take effect for all subsequent calls to `fiftyone.app_config` during your
current session.

.. code-block:: python
    :linenos:

    import fiftyone as fo

    fo.app_config.show_confidence = False
    fo.app_config.show_attributes = False
