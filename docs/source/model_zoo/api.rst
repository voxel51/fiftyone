.. _model-zoo-api:

Model Zoo API Reference
=======================

.. default-role:: code

You can interact with the Model Zoo either via the Python library or the CLI.

.. tabs::

  .. group-tab:: Python

    The Model Zoo is accessible via the :mod:`fiftyone.zoo` package.

  .. group-tab:: CLI

    The :ref:`fiftyone zoo models <cli-fiftyone-zoo-models>` command
    provides convenient utilities for working with models in the FiftyOne Model
    Zoo.

.. _model-zoo-list:

Listing zoo models
------------------

.. tabs::

  .. group-tab:: Python

    You can list the available zoo models via
    :meth:`list_zoo_models() <fiftyone.zoo.models.list_zoo_models>`:

    .. code-block:: python
        :linenos:

        import fiftyone.zoo as foz

        available_models = foz.list_zoo_models()

        print(available_models)

    .. code-block:: text

        ['alexnet-imagenet-torch',
        'deeplabv3-cityscapes-tf',
        'deeplabv3-mnv2-cityscapes-tf',
        ...
        'wide-resnet50-2-imagenet-torch',
        'yolo-v2-coco-tf1'
        ]

    To view the zoo models that you have downloaded, you can use
    :meth:`list_downloaded_zoo_models() <fiftyone.zoo.models.list_downloaded_zoo_models>`:

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        downloaded_models = foz.list_downloaded_zoo_models()
        fo.pprint(downloaded_models)

    .. code-block:: text

        {
            'alexnet-imagenet-torch': (
                '/Users/Brian/fiftyone/__models__/alexnet-owt-4df8aa71.pth',
                <fiftyone.zoo.models.ZooModel object at 0x122d2fa58>,
            ),
            'densenet121-imagenet-torch': (
                '/Users/Brian/fiftyone/__models__/densenet121-a639ec97.pth',
                <fiftyone.zoo.models.ZooModel object at 0x122d608d0>,
            ),
            ...
        }

  .. group-tab:: CLI

    You can access information about the available zoo models via the
    :ref:`fiftyone zoo models list <cli-fiftyone-zoo-models-list>` command.

    For example, to list the available zoo models and whether you have
    downloaded them, you can execute:

    .. code-block:: shell

        fiftyone zoo models list

    Models that have been downloaded are indicated by a checkmark in the
    ``downloaded`` column, and their location on disk is indicated by the
    ``model_path`` column.

.. _model-zoo-info:

Getting information about zoo models
------------------------------------

.. tabs::

  .. group-tab:: Python

    Each zoo model is represented by a
    :class:`ZooModel <fiftyone.zoo.models.ZooModel>` subclass, which contains
    information about the model, its package requirements and CPU/GPU support,
    and more. You can access this object for a given model via the
    :meth:`get_zoo_model() <fiftyone.zoo.models.get_zoo_model>` method.

    For example, let's print some information about a Faster R-CNN PyTorch
    model:

    .. code-block:: python
        :linenos:

        import fiftyone.zoo as foz

        zoo_model = foz.get_zoo_model("faster-rcnn-resnet50-fpn-coco-torch")

        print("***** Model description *****")
        print(zoo_model.description)

        print("\n***** License *****")
        print(zoo_model.license)

        print("\n***** Tags *****")
        print(zoo_model.tags)

        print("\n***** Requirements *****")
        print(zoo_model.requirements)

    .. code-block:: text

        ***** Model description *****
        Faster R-CNN model with ResNet-50 FPN backbone trained on COCO. Source: https://pytorch.org/docs/stable/torchvision/models.html

        ***** License *****
        BSD 3-Clause

        ***** Tags *****
        ['detection', 'coco', 'torch']

        ***** Requirements *****
        {
            "packages": [
                "torch",
                "torchvision"
            ],
            "cpu": {
                "support": true
            },
            "gpu": {
                "support": true
            }
        }

    When a zoo model is downloaded, you can use
    :meth:`find_zoo_model() <fiftyone.zoo.models.find_zoo_model>` to locate the
    downloaded model on disk:

    For example, let's get the path on disk to the Faster R-CNN model
    referenced above (assuming it is downloaded):

    .. code-block:: python
        :linenos:

        import fiftyone.zoo as foz

        model_path = foz.find_zoo_model("faster-rcnn-resnet50-fpn-coco-torch")

  .. group-tab:: CLI

    You can view detailed information about a model (either downloaded or
    not) via the :ref:`fiftyone zoo models info <cli-fiftyone-zoo-models-info>`
    command.

    For example, you can view information about a Faster R-CNN PyTorch model:

    .. code-block:: shell

        fiftyone zoo models info faster-rcnn-resnet50-fpn-coco-torch

    .. code-block:: text

        ***** Model description *****
        {
            "base_name": "faster-rcnn-resnet50-fpn-coco-torch",
            "base_filename": "fasterrcnn_resnet50_fpn_coco-258fb6c6.pth",
            "author": "Shaoqing Ren, et al.",
            "version": null,
            "url": null,
            "source": "https://pytorch.org/vision/main/models.html",
            "license": "BSD 3-Clause",
            "description": "Faster R-CNN model from `Faster R-CNN: Towards Real-Time Object Detection with Region Proposal Networks <https://arxiv.org/abs/1506.01497>`_ with ResNet-50 FPN backbone trained on COCO",
            "size_bytes": 167502836,
            "manager": {
                "type": "fiftyone.core.models.ModelManager",
                "config": {
                    "url": "https://download.pytorch.org/models/fasterrcnn_resnet50_fpn_coco-258fb6c6.pth"
                }
            },
            "default_deployment_config_dict": {
                "type": "fiftyone.zoo.models.torch.TorchvisionImageModel",
                "config": {
                    "entrypoint_fcn": "torchvision.models.detection.faster_rcnn.fasterrcnn_resnet50_fpn",
                    "entrypoint_args": {
                        "weights": "FasterRCNN_ResNet50_FPN_Weights.DEFAULT"
                    },
                    "output_processor_cls": "fiftyone.utils.torch.DetectorOutputProcessor",
                    "labels_path": "{{eta-resources}}/ms-coco-labels.txt",
                    "confidence_thresh": 0.3
                }
            },
            "requirements": {
                "packages": [
                    "torch",
                    "torchvision"
                ],
                "cpu": {
                    "support": true
                },
                "gpu": {
                    "support": true
                }
            },
            "tags": [
                "detection",
                "coco",
                "torch",
                "faster-rcnn",
                "resnet"
            ],
            "date_added": "2020-12-11T13:45:51"
        }

        ***** Model location *****
        /Users/Brian/fiftyone/__models__/fasterrcnn_resnet50_fpn_coco-258fb6c6.pth

.. _model-zoo-download:

Downloading zoo models
----------------------

.. tabs::

  .. group-tab:: Python

    You can download zoo models from the web via
    :meth:`download_zoo_model() <fiftyone.zoo.models.download_zoo_model>`.

    For example, let's download a Faster R-CNN PyTorch model:

    .. code-block:: python
        :linenos:

        import fiftyone.zoo as foz

        model_path = foz.download_zoo_model("faster-rcnn-resnet50-fpn-coco-torch")

    .. code-block:: text

        Downloading model from 'https://download.pytorch.org/models/fasterrcnn_resnet50_fpn_coco-258fb6c6.pth'...
         100% |██████████████████████████████████|    1.2Gb/1.2Gb [4.7s elapsed, 0s remaining, 294.7Mb/s]

  .. group-tab:: CLI

    You can download zoo models from the web via the
    :ref:`fiftyone zoo models download <cli-fiftyone-zoo-models-download>`
    command.

    For example, you can download a Faster R-CNN PyTorch model as follows:

    .. code-block:: shell

        fiftyone zoo models download faster-rcnn-resnet50-fpn-coco-torch

    .. code-block:: text

        Downloading model from 'https://download.pytorch.org/models/fasterrcnn_resnet50_fpn_coco-258fb6c6.pth'...
         100% |██████████████████████████████████|    1.2Gb/1.2Gb [4.7s elapsed, 0s remaining, 294.7Mb/s]

.. _model-zoo-requirements:

Installing zoo model requirements
---------------------------------

.. tabs::

  .. group-tab:: Python

    Some models in the FiftyOne Model Zoo may require packages that are not
    installed by default when FiftyOne is installed.

    You can check to see if your current environment satisfies the requirements
    for a particular zoo model via
    :meth:`ensure_zoo_model_requirements() <fiftyone.zoo.models.ensure_zoo_model_requirements>`:

    .. code-block:: python
        :linenos:

        import fiftyone.zoo as foz

        # Raises an error if the requirements are not satisfied
        foz.ensure_zoo_model_requirements("faster-rcnn-resnet50-fpn-coco-torch")

    You can also use
    :meth:`install_zoo_model_requirements() <fiftyone.zoo.models.install_zoo_model_requirements>`
    to install any necessary packages for a particular model:

    .. code-block:: python
        :linenos:

        import fiftyone.zoo as foz

        foz.install_zoo_model_requirements("faster-rcnn-resnet50-fpn-coco-torch")

  .. group-tab:: CLI

    Some models in the FiftyOne Model Zoo may require packages that are not
    installed by default when FiftyOne is installed.

    You can view the requirements for a zoo model via the
    :ref:`fiftyone zoo models requirements <cli-fiftyone-zoo-models-requirements>`
    command:

    .. code-block:: shell

        fiftyone zoo models requirements faster-rcnn-resnet50-fpn-coco-torch

    .. code-block:: text

        ***** Model requirements *****
        {
            "packages": [
                "torch",
                "torchvision"
            ],
            "cpu": {
                "support": true
            },
            "gpu": {
                "support": true
            }
        }

        ***** Current machine *****
        GPU: no

    You can use the `--ensure` flag to check to see if your current environment
    satisfies the requirements for a particular zoo model:

    .. code-block:: shell

        # Raises an error if the requirements are not satisfied
        fiftyone zoo models requirements --ensure faster-rcnn-resnet50-fpn-coco-torch

    You can also use the `--install` flag to install any necessary packages for
    a particular zoo model:

    .. code-block:: shell

        fiftyone zoo models requirements --install faster-rcnn-resnet50-fpn-coco-torch

.. _model-zoo-load:

Loading zoo models
------------------

You can load a zoo model via
:meth:`load_zoo_model() <fiftyone.zoo.models.load_zoo_model>`.

By default, the model will be automatically downloaded from the web the first
time you access it if it is not already downloaded:

.. code-block:: python
    :linenos:

    import fiftyone.zoo as foz

    # The model will be downloaded from the web the first time you access it
    model = foz.load_zoo_model("faster-rcnn-resnet50-fpn-coco-torch")

You can also provide additional arguments to
:meth:`load_zoo_model() <fiftyone.zoo.models.load_zoo_model>` to customize
the import behavior:

.. code-block:: python
    :linenos:

    # Load the zoo model and install any necessary requirements in order to
    # use it (logging warnings if any issues arise)
    model = foz.load_zoo_model(
        "faster-rcnn-resnet50-fpn-coco-torch",
        install_requirements=True,
        error_level=1,
    )

.. note::

    By default, FiftyOne will attempt to ensure that any requirements such as
    Python packages or CUDA versions are satisfied before loading the model,
    and an error will be raised if a requirement is not satisfied.

    You can customize this behavior via the ``error_level`` argument to
    :meth:`load_zoo_model() <fiftyone.zoo.models.load_zoo_model>`, or you can
    permanently adjust this behavior by setting the ``requirement_error_level``
    parameter of your :ref:`FiftyOne config <configuring-fiftyone>`.

    An ``error_level`` of ``0`` will raise an error if a requirement is not
    satisfied, ``1`` will log a warning if the requirement is not satisfied,
    and ``2`` will ignore unsatisfied requirements.

    If you are using a ``conda`` environment, it is recommended you use an
    ``error_level`` of ``1`` or ``2``, since FiftyOne uses ``pip`` to check for
    requirements.

.. _model-zoo-apply:

Applying zoo models
-------------------

.. tabs::

  .. group-tab:: Python

    You can run inference on a dataset (or a subset of it specified by a
    |DatasetView|) with a zoo model by loading it and then calling
    :meth:`apply_model() <fiftyone.core.collections.SampleCollection.apply_model>`:

    For example, the snippet below loads the
    ``faster-rcnn-resnet50-fpn-coco-torch`` model from the Model Zoo and
    applies it to 10 random images from the ``quickstart`` dataset from the
    Dataset Zoo:

    .. code-block:: python
        :linenos:

        import fiftyone.zoo as foz

        # Load zoo model
        model = foz.load_zoo_model("faster-rcnn-resnet50-fpn-coco-torch")

        # Load zoo dataset
        dataset = foz.load_zoo_dataset("quickstart")
        samples = dataset.take(10)

        # Run inference
        samples.apply_model(model, label_field="faster_rcnn")

  .. group-tab:: CLI

    You can run inference on a dataset with a zoo model via the
    :ref:`fiftyone zoo models apply <cli-fiftyone-zoo-models-apply>` command.

    For example, the snippet below loads the ``quickstart`` dataset from the
    Dataset Zoo and applies the ``faster-rcnn-resnet50-fpn-coco-torch`` model
    from the Model Zoo to it:

    .. code-block:: shell

        # Load zoo dataset
        fiftyone zoo datasets load quickstart

        # Apply zoo model
        fiftyone zoo models apply \
            faster-rcnn-resnet50-fpn-coco-torch \   # model
            quickstart \                            # dataset
            faster_rcnn                             # label field

.. _model-zoo-embed:

Generating embeddings with zoo models
-------------------------------------

.. tabs::

  .. group-tab:: Python

    Many models in the Model Zoo expose embeddings for their predictions. You
    can determine if a model supports embeddings by loading it and checking the
    :meth:`Model.has_embeddings <fiftyone.core.models.Model.has_embeddings>`
    attribute:

    .. code-block:: python
        :linenos:

        import fiftyone.zoo as foz

        # Load zoo model
        model = foz.load_zoo_model("inception-v3-imagenet-torch")

        # Check if model exposes embeddings
        model.has_embeddings  # True

    For models that expose embeddings, you can generate embeddings for all
    samples in a dataset (or a subset of it specified by a |DatasetView|) by
    calling
    :meth:`compute_embeddings() <fiftyone.core.collections.SampleCollection.compute_embeddings>`:

    .. code-block:: python
        :linenos:

        import fiftyone.zoo as foz

        # Load zoo model
        model = foz.load_zoo_model("inception-v3-imagenet-torch")
        model.has_embeddings  # True

        # Load zoo dataset
        dataset = foz.load_zoo_dataset("quickstart")
        samples = dataset.take(10)

        # Generate embeddings for each sample and return them in a
        # `num_samples x dim` array
        embeddings = samples.compute_embeddings(model)

        # Generate embeddings for each sample and store them in a sample field
        samples.compute_embeddings(model, embeddings_field="embeddings")

    You can also use
    :meth:`compute_patch_embeddings() <fiftyone.core.collections.SampleCollection.compute_patch_embeddings>`
    to generate embeddings for image patches defined by another label field,
    e.g,. the detections generated by a detection model.

  .. group-tab:: CLI

    For models that expose embeddings, you can generate embeddings for all
    samples in a dataset via the
    :ref:`fiftyone zoo models embed <cli-fiftyone-zoo-models-embed>` command.

    For example, the snippet below loads the ``quickstart`` dataset from the
    Dataset Zoo and generates embeddings for each sample using the
    ``inception-v3-imagenet-torch`` model from the Model Zoo:

    .. code-block:: shell

        # Load zoo dataset
        fiftyone zoo datasets load quickstart

        # Generate embeddings via zoo model
        fiftyone zoo models embed \
            inception-v3-imagenet-torch \           # model
            quickstart \                            # dataset
            embeddings                              # embeddings field

.. _model-zoo-custom-dir:

Controlling where zoo models are downloaded
-------------------------------------------

By default, zoo models are downloaded into subdirectories of
``fiftyone.config.model_zoo_dir`` corresponding to their names.

You can customize this backend by modifying the ``model_zoo_dir`` setting of
your :ref:`FiftyOne config <configuring-fiftyone>`.

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

            import fiftyone as fo

            # Customize where zoo models are downloaded
            fo.config.model_zoo_dir = "/your/custom/directory"

.. _model-zoo-delete:

Deleting zoo models
-------------------

.. tabs::

  .. group-tab:: Python

    You can delete the local copy of a zoo model via
    :meth:`delete_zoo_model() <fiftyone.zoo.models.delete_zoo_model>`:

    .. code-block:: python
        :linenos:

        import fiftyone.zoo as foz

        foz.delete_zoo_model("faster-rcnn-resnet50-fpn-coco-torch")

  .. group-tab:: CLI

    You can delete the local copy of a zoo model via the
    :ref:`fiftyone zoo models delete <cli-fiftyone-zoo-models-delete>` command:

    .. code-block:: shell

        fiftyone zoo models delete faster-rcnn-resnet50-fpn-coco-torch

.. _model-zoo-add:

Adding models to the zoo
------------------------

We frequently add new models to the Model Zoo, which will automatically become
accessible to you when you update your FiftyOne package.

.. note::

    FiftyOne is open source! You are welcome to contribute models to the public
    model zoo by submitting a pull request to
    `the GitHub repository <https://github.com/voxel51/fiftyone>`_.

You can also add your own models to your local model zoo, enabling you to work
with these models via the :mod:`fiftyone.zoo` package and the CLI using the
same syntax that you would with publicly available models.

To add model(s) to your local zoo, you simply write a JSON manifest file in
the format below to tell FiftyOne about the model(s). For example, the manifest
below adds a second copy of the ``yolo-v2-coco-tf1`` model to the zoo under the
alias ``yolo-v2-coco-tf1-high-conf`` that only returns predictions whose
confidence is at least 0.5:

.. code-block:: json

    {
        "models": [
            {
                "base_name": "yolo-v2-coco-tf1-high-conf",
                "base_filename": "yolo-v2-coco-high-conf.weights",
                "version": null,
                "description": "A YOLOv2 model with confidence threshold set to 0.5",
                "manager": {
                    "type": "fiftyone.core.models.ModelManager",
                    "config": {
                        "google_drive_id": "1ajuPZws47SOw3xJc4Wvk1yuiB3qv8ycr"
                    }
                },
                "default_deployment_config_dict": {
                    "type": "fiftyone.utils.eta.ETAModel",
                    "config": {
                        "type": "eta.detectors.YOLODetector",
                        "config": {
                            "config_dir": "{{eta}}/tensorflow/darkflow/cfg/",
                            "config_path": "{{eta}}/tensorflow/darkflow/cfg/yolo.cfg",
                            "confidence_thresh": 0.5
                        }
                    }
                },
                "requirements": {
                    "cpu": {
                        "support": true,
                        "packages": ["tensorflow<2"]
                    },
                    "gpu": {
                        "support": true,
                        "packages": ["tensorflow-gpu<2"]
                    }
                },
                "tags": ["detection", "coco", "tf1"],
                "date_added": "2020-12-11 13:45:51"
            }
        ]
    }

.. note::

    Adjusting the hard-coded threshold of the above model is possible via
    JSON-only changes in this case because the underlying
    `eta.detectors.YOLODetector <https://github.com/voxel51/eta/blob/develop/eta/detectors/yolo.py>`_
    class exposes this as a parameter.

    In practice, there is no need to hard-code confidence thresholds in models,
    since the
    :meth:`apply_model() <fiftyone.core.collections.SampleCollection.apply_model>`
    method supports supplying an optional confidence threshold that is applied
    post-facto to the predictions generated by any model.

Models manifest JSON files should have a ``models`` key that contains a list
of serialized
:class:`ZooModel class definitions <fiftyone.zoo.models.ZooModel>` that
describe how to download and load the model.

Finally, expose your new models(s) to FiftyOne by adding your manifest to the
``model_zoo_manifest_paths`` parameter of your
:ref:`FiftyOne config <configuring-fiftyone>`. One way to do this is to set the
``FIFTYONE_MODEL_ZOO_MANIFEST_PATHS`` environment variable:

.. code-block:: shell

    export FIFTYONE_MODEL_ZOO_MANIFEST_PATHS=/path/to/custom/manifest.json

Now you can load and apply the ``yolo-v2-coco-tf1-high-conf`` model as you
would any other zoo model:

.. code-block:: python

    import fiftyone as fo
    import fiftyone.zoo as foz

    # Load custom model
    model = foz.load_zoo_model("yolo-v2-coco-tf1-high-conf")

    # Apply model to a dataset
    dataset = fo.load_dataset(...)
    dataset.apply_model(model, label_field="predictions")
