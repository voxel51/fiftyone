
.. _model-zoo:

FiftyOne Model Zoo
==================

.. default-role:: code

FiftyOne provides a Model Zoo that contains a collection of pre-trained models
that you can download and run inference on your FiftyOne Datasets via a few
simple commands.

You can interact with the Model Zoo either via the Python library or the CLI.

.. tabs::

  .. group-tab:: Python

    The Model Zoo is accessible via the :mod:`fiftyone.zoo.models` package.

  .. group-tab:: CLI

    The :ref:`fiftyone model-zoo <cli-fiftyone-model-zoo>` CLI command provides
    convenient utilities for working with models in the FiftyOne Model Zoo.

Listing zoo models
------------------

.. tabs::

  .. group-tab:: Python

    You can list the available zoo models via
    :meth:`list_zoo_models() <fiftyone.zoo.models.list_zoo_models>`:

    .. code-block:: python
        :linenos:

        import fiftyone.zoo.models as fozm

        available_models = fozm.list_zoo_models()

        print(available_models)

    .. code-block:: text

        ['deeplabv3-cityscapes',
        'deeplabv3-mnv2-cityscapes',
        'efficientdet-d0-coco',
        'efficientdet-d1-coco,
        ...
        'vgg16-imagenet',
        'yolo-v2-coco']

    To view the zoo models that you have downloaded, you can use
    :meth:`list_downloaded_zoo_models() <fiftyone.zoo.models.list_downloaded_zoo_models>`:

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo.models as fozm

        downloaded_models = fozm.list_downloaded_zoo_models()
        fo.pprint(downloaded_models)

    .. code-block:: text

        {
            ...
            'efficientdet-d0-coco': (
                '~/fiftyone/__models__/efficientdet-d0-coco.tar',
                <fiftyone.zoo.models.ZooModel object at 0x12e31dcc0>,
            ),
            'yolo-v2-coco': (
                '~/fiftyone/__models__/yolo-v2-coco.weights',
                <fiftyone.zoo.models.ZooModel object at 0x12e31dbe0>,
            ),
            ...
        }

  .. group-tab:: CLI

    You can access information about the available zoo models via the
    :ref:`fiftyone model-zoo list <cli-fiftyone-model-zoo-list>` command.

    For example, to list the available zoo models and whether you have
    downloaded them, you can execute:

    .. code-block:: text

        $ fiftyone model-zoo list

    Models that have been downloaded are indicated by a checkmark in the
    ``downloaded`` column, and their location on disk is indicated by the
    ``model_path`` column.

Getting information about zoo models
------------------------------------

.. tabs::

  .. group-tab:: Python

    Each zoo model is represented by a
    :class:`ZooModel <fiftyone.zoo.models.ZooModel>` subclass, which contains
    information about the model, its package requirements and CPU/GPU support,
    and more. You can access this object for a given model via the
    :meth:`get_zoo_model() <fiftyone.zoo.models.get_zoo_model>` method.

    For example, let's print some information about an EfficientDet-D4 model:

    .. code-block:: python
        :linenos:

        import fiftyone.zoo.models as fozm

        zoo_model = fozm.get_zoo_model("efficientdet-d4-coco")

        print("***** Dataset description *****")
        print(zoo_model.description)

        print("\n***** Requirements *****")
        print(zoo_model.requirements)

    .. code-block:: text

        ***** Dataset description *****
        EfficientDet-D4 model trained on COCO. Source: https://github.com/voxel51/automl/tree/master/efficientdet

        ***** Requirements *****
        {
            "cpu": {
                "support": true,
                "packages": [
                    "tensorflow>=1.14,<2"
                ]
            },
            "gpu": {
                "support": true,
                "packages": [
                    "tensorflow-gpu>=1.14,<2"
                ]
            }
        }

    When a zoo model is downloaded, you can use
    :meth:`find_zoo_model() <fiftyone.zoo.models.find_zoo_model>` to locate the
    downloaded model on disk:

    For example, let's print some information about the EfficientDet-D4 model
    (assuming it is downloaded):

    .. code-block:: python
        :linenos:

        import fiftyone.zoo.models as fozm

        model_path = fozm.find_zoo_model("efficientdet-d4-coco")

  .. group-tab:: CLI

    You can view detailed information about a model (either downloaded or
    not) via the :ref:`fiftyone model-zoo info <cli-fiftyone-model-zoo-info>`
    command.

    For example, you can view information about the EfficientDet-D4 model:

    .. code-block:: text

        $ fiftyone model-zoo info efficientdet-d4-coco

        ***** Model description *****
        {
            "base_name": "efficientdet-d4-coco",
            "base_filename": "efficientdet-d4-coco.tar",
            "version": null,
            "description": "EfficientDet-D4 model trained on COCO. Source: https://github.com/voxel51/automl/tree/master/efficientdet",
            "manager": {
                "type": "eta.core.models.ETAModelManager",
                "config": {
                    "extract_archive": true,
                    "delete_archive": true,
                    "google_drive_id": "1FO2WwtubQ0I6giHKHSutI-C628JpQM71"
                }
            },
            "default_deployment_config_dict": {
                "type": "eta.detectors.EfficientDet",
                "config": {
                    "model_name": "efficientdet-d4-coco",
                    "architecture_name": "efficientdet-d4",
                    "labels_path": "{{eta-resources}}/ms-coco-labels.txt"
                }
            },
            "requirements": {
                "cpu": {
                    "support": true,
                    "packages": [
                        "tensorflow>=1.14,<2"
                    ]
                },
                "gpu": {
                    "support": true,
                    "packages": [
                        "tensorflow-gpu>=1.14,<2"
                    ]
                }
            },
            "date_created": "2020-03-22T21:44:00"
        }

        ***** Model location *****
        ~/fiftyone/__models__/efficientdet-d4-coco.tar

Downloading zoo models
----------------------

.. tabs::

  .. group-tab:: Python

    You can download zoo models from the web via
    :meth:`download_zoo_model() <fiftyone.zoo.models.download_zoo_model>`.

    For example, let's download the EfficientDet-D4 model:

    .. code-block:: python
        :linenos:

        import fiftyone.zoo.models as fozm

        model_path = fozm.download_zoo_model("efficientdet-d4-coco")

    .. code-block:: text

        Downloading model from Google Drive ID '1FO2WwtubQ0I6giHKHSutI-C628JpQM71' to '~/fiftyone/__models__/efficientdet-d4-coco.tar'
        100% |██████████████████████████████████|    1.4Gb/1.4Gb [5.2s elapsed, 0s remaining, 261.4Mb/s]

  .. group-tab:: CLI

    You can download zoo models from the web via the
    :ref:`fiftyone model-zoo download <cli-fiftyone-model-zoo-download>`
    command.

    For example, you can download the EfficientDet-D4 model as follows:

    .. code-block:: text

        $ fiftyone zoo download efficientdet-d4-coco

        Downloading model from Google Drive ID '1FO2WwtubQ0I6giHKHSutI-C628JpQM71' to '~/fiftyone/__models__/efficientdet-d4-coco.tar'
        100% |██████████████████████████████████|    1.4Gb/1.4Gb [5.2s elapsed, 0s remaining, 261.4Mb/s]

Installing model requirements
-----------------------------

.. tabs::

  .. group-tab:: Python

    Some models in the FiftyOne Model Zoo may require packages that are not
    installed by default when FiftyOne is installed.

    You can check to see if your current environment satisfies the requirements
    for a particular zoo model via
    :meth:`ensure_zoo_model_requirements() <fiftyone.zoo.models.ensure_zoo_model_requirements>`:

    .. code-block:: python
        :linenos:

        import fiftyone.zoo.models as fozm

        # Raises an error if the requirements are not satisfied
        fozm.ensure_zoo_model_requirements("efficientdet-d4-coco")

    You can also use
    :meth:`install_zoo_model_requirements() <fiftyone.zoo.models.install_zoo_model_requirements>`
    to install any necessary packages for a particular model:

    .. code-block:: python
        :linenos:

        import fiftyone.zoo.models as fozm

        fozm.install_zoo_model_requirements("efficientdet-d4-coco")

  .. group-tab:: CLI

    Some models in the FiftyOne Model Zoo may require packages that are not
    installed by default when FiftyOne is installed.

    You can view the requirements for a zoo model via the
    :ref:`fiftyone model-zoo requirements <cli-fiftyone-model-zoo-requirements>`
    command:

    .. code-block:: text

        $ fiftyone model-zoo requirements efficientdet-d4-coco

    .. code-block:: text

        ***** Model requirements *****
        {
            "cpu": {
                "support": true,
                "packages": [
                    "tensorflow>=1.14,<2"
                ]
            },
            "gpu": {
                "support": true,
                "packages": [
                    "tensorflow-gpu>=1.14,<2"
                ]
            }
        }

        ***** Current machine *****
        GPU: no

    You can use the `--ensure` flag to check to see if your current environment
    satisfies the requirements for a particular zoo model:

    .. code-block:: text

        # Raises an error if the requirements are not satisfied
        $ fiftyone model-zoo requirements --ensure efficientdet-d4-coco

    You can also use the `--install` flag to install any necessary packages for
    a particular zoo model:

    .. code-block:: text

        $ fiftyone model-zoo requirements --install efficientdet-d4-coco

Loading zoo models
------------------

.. tabs::

  .. group-tab:: Python

    You can load a zoo model via
    :meth:`load_zoo_model() <fiftyone.zoo.models.load_zoo_model>`.

    By default, the model will be automatically downloaded from the web the
    first time you access it if it is not already downloaded:

    .. code-block:: python
        :linenos:

        import fiftyone.zoo.models as fozm

        # The model will be downloaded from the web the first time you access it
        model = fozm.load_zoo_model("efficientdet-d4-coco")

    You can also provide additional arguments to
    :meth:`load_zoo_model() <fiftyone.zoo.models.load_zoo_model>` to customize
    the import behavior:

    .. code-block:: python
        :linenos:

        # Load the zoo model and install any necessary requirements in order to
        # use it (logging warnings if any issues arise)
        model = fozm.load_zoo_model(
            "efficientdet-d4-coco",
            install_requirements=True,
            error_level=1,
        )

Controlling where zoo models are downloaded
-------------------------------------------

By default, zoo models are downloaded into subdirectories of
``fiftyone.config.model_zoo_dir`` corresponding to their names.

You can customize this backend by modifying the `model_zoo_dir` setting of your
:doc:`FiftyOne config </user_guide/config>`.

.. tabs::

    .. group-tab:: JSON

        Directly edit your FiftyOne config at `~/.fiftyone/config.json`:

        .. code-block:: shell

            # Print your current config
            fiftyone config

            # Locate your config (and edit the `model_zoo_dir` field)
            fiftyone constants FIFTYONE_CONFIG_PATH

    .. group-tab:: Environment

        Set the ``FIFTYONE_MODEL_ZOO_DIR`` environment variable:

        .. code-block:: shell

            # Customize where zoo models are downloaded
            export FIFTYONE_MODEL_ZOO_DIR=/your/custom/directory

    .. group-tab:: Code

        Set the `model_zoo_dir` config setting from Python code:

        .. code-block:: python
            :linenos:

            # Customize where zoo models are downloaded
            import fiftyone.core.config as foc

            foc.set_config_settings(model_zoo_dir="/your/custom/directory")

Deleting zoo models
-------------------

.. tabs::

  .. group-tab:: Python

    You can delete the local copy of a zoo model via
    :meth:`delete_zoo_model() <fiftyone.zoo.models.delete_zoo_model>`:

    .. code-block:: python
        :linenos:

        import fiftyone.zoo.models as fozm

        fozm.delete_zoo_model("efficientdet-d4-coco")

  .. group-tab:: CLI

    You can delete the local copy of a zoo model via the
    :ref:`fiftyone model-zoo delete <cli-fiftyone-model-zoo-delete>` command:

    .. code-block:: text

        $ fiftyone model-zoo delete efficientdet-d4-coco
