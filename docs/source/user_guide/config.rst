Configuring FiftyOne
====================

.. default-role:: code

FiftyOne can be configured in various ways. This guide covers the various
options that exist, how to view your current config, and how to customize your
config as desired.

.. _configuring-fiftyone:

Configuration options
---------------------

FiftyOne supports the configuration options described below:

+------------------------------+-------------------------------------+-----------------------------+----------------------------------------------------------------------------------------+
| Config field                 | Environment variable                | Default value               | Description                                                                            |
+==============================+=====================================+=============================+========================================================================================+
| `database_dir`               | `FIFTYONE_DATABASE_DIR`             | `~/.fiftyone/var/lib/mongo` | The directory in which to store FiftyOne's backing database.                           |
+------------------------------+-------------------------------------+-----------------------------+----------------------------------------------------------------------------------------+
| `dataset_zoo_dir`            | `FIFTYONE_DATASET_ZOO_DIR`          | `~/fiftyone`                | The default directory in which to store datasets that are downloaded from the          |
|                              |                                     |                             | :ref:`FiftyOne Dataset Zoo <dataset-zoo>`.                                             |
+------------------------------+-------------------------------------+-----------------------------+----------------------------------------------------------------------------------------+
| `dataset_zoo_manifest_paths` | `FIFTYONE_ZOO_MANIFEST_PATHS`       | `None`                      | A list of manifest JSON files specifying additional zoo datasets. See                  |
|                              |                                     |                             | :ref:`adding datasets to the zoo <adding-zoo-datasets>` for more information.          |
+------------------------------+-------------------------------------+-----------------------------+----------------------------------------------------------------------------------------+
| `default_dataset_dir`        | `FIFTYONE_DEFAULT_DATASET_DIR`      | `~/fiftyone`                | The default directory to use when performing FiftyOne operations that                  |
|                              |                                     |                             | require writing dataset contents to disk, such as ingesting datasets via               |
|                              |                                     |                             | :meth:`ingest_labeled_images() <fiftyone.core.dataset.Dataset.ingest_labeled_images>`. |
+------------------------------+-------------------------------------+-----------------------------+----------------------------------------------------------------------------------------+
| `default_ml_backend`         | `FIFTYONE_DEFAULT_ML_BACKEND`       | `torch`                     | The default ML backend to use when performing operations such as                       |
|                              |                                     |                             | downloading datasets from the FiftyOne Dataset Zoo that support multiple ML            |
|                              |                                     |                             | backends. Supported values are `torch` and `tensorflow`. By default,                   |
|                              |                                     |                             | `torch` is used if `PyTorch <https://pytorch.org>`_ is installed in your               |
|                              |                                     |                             | Python environment, and `tensorflow` is used if                                        |
|                              |                                     |                             | `TensorFlow <http://tensorflow.org>`_ is installed. If no supported backend            |
|                              |                                     |                             | is detected, this defaults to `None`, and any operation that requires an               |
|                              |                                     |                             | installed ML backend will raise an informative error message if invoked in             |
|                              |                                     |                             | this state.                                                                            |
+------------------------------+-------------------------------------+-----------------------------+----------------------------------------------------------------------------------------+
| `default_batch_size`         | `FIFTYONE_DEFAULT_BATCH_SIZE`       | `None`                      | A default batch size to use when :ref:`applying models to datasets <applying-models>`. |
+------------------------------+-------------------------------------+-----------------------------+----------------------------------------------------------------------------------------+
| `requirement_error_level`    | `FIFTYONE_REQUIREMENT_ERROR_LEVEL`  | `0`                         | A default error level to use when ensuring/installing requirements for models from the |
|                              |                                     |                             | model zoo. See :ref:`loading zoo models <loading-zoo-models>` for more information.    |
+------------------------------+-------------------------------------+-----------------------------+----------------------------------------------------------------------------------------+
| `default_sequence_idx`       | `FIFTYONE_DEFAULT_SEQUENCE_IDX`     | `%06d`                      | The default numeric string pattern to use when writing sequential lists of             |
|                              |                                     |                             | files.                                                                                 |
+------------------------------+-------------------------------------+-----------------------------+----------------------------------------------------------------------------------------+
| `default_image_ext`          | `FIFTYONE_DEFAULT_IMAGE_EXT`        | `.jpg`                      | The default image format to use when writing images to disk.                           |
+------------------------------+-------------------------------------+-----------------------------+----------------------------------------------------------------------------------------+
| `default_video_ext`          | `FIFTYONE_DEFAULT_VIDEO_EXT`        | `.mp4`                      | The default video format to use when writing videos to disk.                           |
+------------------------------+-------------------------------------+-----------------------------+----------------------------------------------------------------------------------------+
| `default_app_port`           | `FIFTYONE_DEFAULT_APP_PORT`         | `5151`                      | The default port to use to serve the :ref:`FiftyOne App <fiftyone-app>`.               |
+------------------------------+-------------------------------------+-----------------------------+----------------------------------------------------------------------------------------+
| `desktop_app`                | `FIFTYONE_DESKTOP_APP`              | `False`                     | Whether to launch the FiftyOne App in the browser (False) or as a desktop App (True)   |
|                              |                                     |                             | by default. If True, the :ref:`FiftyOne Desktop App <installing-fiftyone-desktop>`     |
|                              |                                     |                             | must be installed.                                                                     |
+------------------------------+-------------------------------------+-----------------------------+----------------------------------------------------------------------------------------+
| `do_not_track`               | `FIFTYONE_DO_NOT_TRACK`             | `False`                     | Controls whether UUID based import and App usage events are tracked.                   |
+------------------------------+-------------------------------------+-----------------------------+----------------------------------------------------------------------------------------+
| `model_zoo_dir`              | `FIFTYONE_MODEL_ZOO_DIR`            | `~/fiftyone/__models__`     | The default directory in which to store models that are downloaded from the            |
|                              |                                     |                             | :ref:`FiftyOne Model Zoo <model-zoo>`.                                                 |
+------------------------------+-------------------------------------+-----------------------------+----------------------------------------------------------------------------------------+
| `model_zoo_manifest_paths`   | `FIFTYONE_MODEL_ZOO_MANIFEST_PATHS` | `None`                      | A list of manifest JSON files specifying additional zoo models. See                    |
|                              |                                     |                             | :ref:`adding models to the zoo <adding-zoo-models>` for more information.              |
+------------------------------+-------------------------------------+-----------------------------+----------------------------------------------------------------------------------------+
| `show_progress_bars`         | `FIFTYONE_SHOW_PROGRESS_BARS`       | `True`                      | Controls whether progress bars are printed to the terminal when performing             |
|                              |                                     |                             | operations such reading/writing large datasets or activiating FiftyOne                 |
|                              |                                     |                             | Brain methods on datasets.                                                             |
+------------------------------+-------------------------------------+-----------------------------+----------------------------------------------------------------------------------------+

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
            "default_app_port": 5151,
            "default_batch_size": null,
            "default_dataset_dir": "~/fiftyone",
            "default_ml_backend": "torch",
            "default_sequence_idx": "%08d",
            "default_image_ext": ".jpg",
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
            "default_app_port": 5151,
            "default_batch_size": null,
            "default_dataset_dir": "~/fiftyone",
            "default_ml_backend": "torch",
            "default_sequence_idx": "%08d",
            "default_image_ext": ".jpg",
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

You can modify your FiftyOne config in any of the ways listed below.

The order of precedence for config modifications is as follows:

1. Config settings applied at runtime via
   :func:`fiftyone.core.config.set_config_settings`
2. `FIFTYONE_XXX` environment variables
3. Settings in your JSON config at `~/.fiftyone/config.json`
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
