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
| `database_dir`                | `FIFTYONE_DATABASE_DIR`             | `~/.fiftyone/var/lib/mongo`   | The directory in which to store FiftyOne's backing database.                           |
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
| `requirement_error_level`     | `FIFTYONE_REQUIREMENT_ERROR_LEVEL`  | `0`                           | A default error level to use when ensuring/installing requirements such as third-party |
|                               |                                     |                               | packages. See :ref:`loading zoo models <model-zoo-load>` for an example usage.         |
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
| `desktop_app`                 | `FIFTYONE_DESKTOP_APP`              | `False`                       | Whether to launch the FiftyOne App in the browser (False) or as a desktop App (True)   |
|                               |                                     |                               | by default. If True, the :ref:`FiftyOne Desktop App <installing-fiftyone-desktop>`     |
|                               |                                     |                               | must be installed.                                                                     |
+-------------------------------+-------------------------------------+-------------------------------+----------------------------------------------------------------------------------------+
| `do_not_track`                | `FIFTYONE_DO_NOT_TRACK`             | `False`                       | Controls whether UUID based import and App usage events are tracked.                   |
+-------------------------------+-------------------------------------+-------------------------------+----------------------------------------------------------------------------------------+
| `model_zoo_dir`               | `FIFTYONE_MODEL_ZOO_DIR`            | `~/fiftyone/__models__`       | The default directory in which to store models that are downloaded from the            |
|                               |                                     |                               | :ref:`FiftyOne Model Zoo <model-zoo>`.                                                 |
+-------------------------------+-------------------------------------+-------------------------------+----------------------------------------------------------------------------------------+
| `model_zoo_manifest_paths`    | `FIFTYONE_MODEL_ZOO_MANIFEST_PATHS` | `None`                        | A list of manifest JSON files specifying additional zoo models. See                    |
|                               |                                     |                               | :ref:`adding models to the zoo <model-zoo-add>` for more information.                  |
+-------------------------------+-------------------------------------+-------------------------------+----------------------------------------------------------------------------------------+
| `show_progress_bars`          | `FIFTYONE_SHOW_PROGRESS_BARS`       | `True`                        | Controls whether progress bars are printed to the terminal when performing             |
|                               |                                     |                               | operations such reading/writing large datasets or activiating FiftyOne                 |
|                               |                                     |                               | Brain methods on datasets.                                                             |
+-------------------------------+-------------------------------------+-------------------------------+----------------------------------------------------------------------------------------+

Viewing your config
-------------------

You can print your current FiftyOne config (including any customizations as
described in the next section) at any time via the Python library and the CLI.

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
            "database_dir": "~/.fiftyone/var/lib/mongo",
            "dataset_zoo_dir": "~/fiftyone",
            "dataset_zoo_manifest_paths": null,
            "default_app_config_path": "~/.fiftyone/app_config.json",
            "default_app_port": 5151,
            "default_batch_size": null,
            "default_dataset_dir": "~/fiftyone",
            "default_image_ext": ".jpg",
            "default_ml_backend": "torch",
            "default_sequence_idx": "%06d",
            "default_video_ext": ".mp4",
            "desktop_app": false,
            "do_not_track": false,
            "model_zoo_dir": "~/fiftyone/__models__",
            "model_zoo_manifest_paths": null,
            "requirement_error_level": 0,
            "show_progress_bars": true
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
            "database_dir": "~/.fiftyone/var/lib/mongo",
            "dataset_zoo_dir": "~/fiftyone",
            "dataset_zoo_manifest_paths": null,
            "default_app_config_path": "~/.fiftyone/app_config.json",
            "default_app_port": 5151,
            "default_batch_size": null,
            "default_dataset_dir": "~/fiftyone",
            "default_image_ext": ".jpg",
            "default_ml_backend": "torch",
            "default_sequence_idx": "%06d",
            "default_video_ext": ".mp4",
            "desktop_app": false,
            "do_not_track": false,
            "model_zoo_dir": "~/fiftyone/__models__",
            "model_zoo_manifest_paths": null,
            "requirement_error_level": 0,
            "show_progress_bars": true
        }

        torch

Modifying your config
---------------------

You can modify your FiftyOne config in a variety of ways. The following
sections describe these options in detail.

Order of precedence
~~~~~~~~~~~~~~~~~~~

The following order of precedence is used to assign values to your FiftyOne
config settings at runtime:

1. Config settings applied at runtime via
   :func:`fiftyone.core.config.set_config_settings`
2. `FIFTYONE_XXX` environment variables
3. Settings in your JSON config (`~/.fiftyone/config.json`)
4. The default config values described in the table above

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

You can dynamically modify your FiftyOne config at runtime via the
:func:`fiftyone.core.config.set_config_settings` method, which accepts keyword
arguments of the form `(field name, field value)` for all available config
fields.

Any changes to your FiftyOne config applied via this manner will immediately
take effect in all subsequent calls to `fiftyone.config` during your current
session.

For example, you can customize your FiftyOne config at runtime as follows:

.. code-block:: python
    :linenos:

    import fiftyone.core.config as foc

    foc.set_config_settings(
        default_ml_backend="tensorflow",
        show_progress_bars=True,
    )

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

+---------------------+-----------------------------------+-----------------------------+------------------------------------------------------------------------------------------+
| Config field        | Environment variable              | Default value               | Description                                                                              |
+=====================+===================================+=============================+==========================================================================================+
| `color_pool`        | `FIFTYONE_APP_COLOR_POOL`         | See below                   | A list of browser supported color strings from which the App should draw from when       |
|                     |                                   |                             | drawing labels (e.g., object bounding boxes).                                            |
+---------------------+-----------------------------------+-----------------------------+------------------------------------------------------------------------------------------+
| `default_grid_zoom` | `FIFTYONE_APP_DEFAULT_GRID_ZOOM`  | `5`                         | The default zoom level of the App's sample grid. Larger values result in larger samples  |
|                     |                                   |                             | (and thus fewer samples in the grid). Supported values are `{0, 1, ..., 10}`.            |
+---------------------+-----------------------------------+-----------------------------+------------------------------------------------------------------------------------------+
| `notebook_height`   | `FIFTYONE_APP_NOTEBOOK_HEIGHT`    | `800`                       | The height of App instances displayed in notebook cells.                                 |
+---------------------+-----------------------------------+-----------------------------+------------------------------------------------------------------------------------------+
| `show_attributes`   | `FIFTYONE_APP_SHOW_ATTRIBUTES`    | `False`                     | Whether to show attributes when rendering labels in the App's expanded sample view.      |
+---------------------+-----------------------------------+-----------------------------+------------------------------------------------------------------------------------------+
| `show_confidence`   | `FIFTYONE_APP_SHOW_CONFIDENCE`    | `True`                      | Whether to show confidences when rendering labels in the App's expanded sample view.     |
+---------------------+-----------------------------------+-----------------------------+------------------------------------------------------------------------------------------+
| `show_tooltip`      | `FIFTYONE_APP_SHOW_TOOLTIP`       | `True`                      | Whether to show the tooltip when hovering over labels in the App's expanded sample view. |
+---------------------+-----------------------------------+-----------------------------+------------------------------------------------------------------------------------------+

Viewing your App config
-----------------------

You can print your App config (including any customizations as described in
the next section) at any time via the Python library and the CLI.

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
            "color_pool": [
                "#ee0000",
                "#999900",
                "#009900",
                "#003300",
                "#009999",
                "#000099",
                "#6600ff",
                "#ee6600",
                "#993300",
                "#996633",
                "#0066ff",
                "#cc33cc",
                "#777799"
            ],
            "default_grid_zoom": 5,
            "notebook_height": 800,
            "show_confidence": true,
            "show_attributes": true
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
            "color_pool": [
                "#ee0000",
                "#999900",
                "#009900",
                "#003300",
                "#009999",
                "#000099",
                "#6600ff",
                "#ee6600",
                "#993300",
                "#996633",
                "#0066ff",
                "#cc33cc",
                "#777799"
            ],
            "default_grid_zoom": 5,
            "notebook_height": 800,
            "show_confidence": true,
            "show_attributes": true
        }

        True

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
2. App config settings applied at runtime via
   :func:`fiftyone.core.config.set_app_config_settings`
3. `FIFTYONE_APP_XXX` environment variables
4. Settings in your JSON App config (`~/.fiftyone/app_config.json`)
5. The default App config values described in the table above

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

FiftyOne App config settings may be customized on a per-session basis by
setting the `FIFTYONE_APP_XXX` environment variable(s) for the desired App
config settings.

When `fiftyone` is imported, all App config environment variables are applied,
as per the order of precedence described above.

For example, you can customize your App config in a Terminal session by
issuing the following commands prior to launching your Python interpreter:

.. code-block:: shell

    export FIFTYONE_APP_SHOW_CONFIDENCE=false
    export FIFTYONE_APP_SHOW_ATTRIBUTES=false

Modifying your App config in code
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

You can dynamically modify your App config at runtime via the
:func:`fiftyone.core.config.set_app_config_settings` method, which accepts
keyword arguments of the form `(field name, field value)` for all available
config fields.

Any changes to your App config applied via this manner will immediately take
effect in all subsequent calls to `fiftyone.app_config` during your current
session.

For example, you can customize your App config at runtime as follows:

.. code-block:: python
    :linenos:

    import fiftyone.core.config as foc

    foc.set_app_config_settings(show_confidence=False, show_attributes=False)
