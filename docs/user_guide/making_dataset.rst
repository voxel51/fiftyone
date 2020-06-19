Loading a Dataset
================

.. default-role:: code

FiftyOne supports automatic loading of `Datasets` stored in various common
formats. If your labeled data is stored in a custom format, don't worry, FiftyOne provides support for easily loading your custom data as well.


Supported Types
_______________

FiftyOne `Datasets` currently support image data, either unlabeled or labeled with any 
of the following label types:

* Image Classification

* Object Detection

* Semantic Segmentation

* Instance Segmentation


Loading Formatted Datasets
_____________________________

No matter what format your data is in on disk, you will be able to load it
into FiftyOne. However, functions are provided to automatically load your
`Dataset` if it is in one of the following formats.

Image Directory
---------------

COCO Detection
--------------

VOC Detection
-------------

TF Object Detection
-------------------

CVAT Image
----------


FiftyOne Zoo
------------

FiftyOne provides a `Dataset` zoo which provide access to a collection of
dataset that can be downloaded and loaded into Fiftyone in a single command::
    import fiftyone.zoo as foz

    # List available dataset
    print(foz.list_zoo_datasets())

    # Load a zoo dataset
    # this dataset will be downloaded from the web the first time you access it
    dataset = foz.load_zoo_dataset("cifar10")

    # Print a few samples from the dataset
    print(dataset.view().head())

Behind the scenes, Fiftyone uses `Tensorflow Datasets <https://www.tensorflow.org/datasets>`_ or 
`TorchVision Datasets <https://pytorch.org/docs/stable/torchvision/datasets.html>`_ 
depending on which ML library you have installed. In order to load datasets 
using TF, you must have the 
`tensorflow-datasets <https://pypi.org/project/tensorflow-datasets/>`_ package 
installed on your machine. In order to load datasets using PyTorch, you must have 
the `torch <https://pypi.org/project/torch/>`_ and 
`torchvision <https://pypi.org/project/torchvision/>`_ packages installed.


Customizing your ML Backend
^^^^^^^^^^^^^^^^^^^^^^^^^^^

By default, FiftyOne uses whichever ML backend is available. If both are found,
it uses the backend specified by the `fo.config.default_ml_backedn` setting in
your FiftyOne config.

This setting can be customized in the following ways:

* Directly editing the config at `~/.fiftyone/config.json`::
  # In Terminal

  # Print your current config
  fiftyone config

  # Locate your config
  fiftyone constants FIFTYONE_CONFIG_PATH

* Setting the `FIFTYONE_DEFAULT_ML_BACKEND` environment variable::
  # In Terminal

  # Example: use the `tensorflow` backend
  export FITYONE_DEFAULT_ML_BACKEND=tensorflow

* Setting the `default_ml_backend` config setting from your Python code (this
  does not change it machine-wide, only for the current Python instance)::
  # In Python

  # Example: use the `torch` backend
  import fiftyone.core.config as foc
  foc.set_config_settings(default_ml_backend="torch")


Loading Custom Datasets
___________________________


Modifying Datasets
__________________


Exporting Datasets
__________________
