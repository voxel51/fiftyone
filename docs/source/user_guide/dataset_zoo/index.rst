.. _dataset-zoo:

FiftyOne Dataset Zoo
====================

.. default-role:: code

FiftyOne provides a Dataset Zoo that contains a collection of common datasets
that you can download and load into FiftyOne via a few simple commands.

.. note::

    For some datasets, FiftyOne's Dataset Zoo uses the
    `TorchVision Datasets <https://pytorch.org/vision/stable/datasets.html>`_ or
    `TensorFlow Datasets <https://www.tensorflow.org/datasets>`_, depending on
    which ML library you have installed.

    If you do not have the proper packages installed when attempting to
    download a zoo dataset, you will receive an error message that will help
    you resolve the issue. See
    :ref:`customizing your ML backend <dataset-zoo-ml-backend>` for more
    information about configuring the backend behavior of the Dataset Zoo.

Available datasets
------------------

The Dataset Zoo contains dozens of datasets that you can load into FiftyOne
with a few simple commands. Click the link below to see all of the datasets in
the zoo!

.. custombutton::
    :button_text: Explore the datasets in the zoo
    :button_link: datasets.html

API reference
-------------

The Dataset Zoo can be accessed via Python library and the CLI. Consult the
API reference below to see how to download, load, and manage zoo datasets.

.. custombutton::
    :button_text: Check out the API reference
    :button_link: api.html

.. _dataset-zoo-basic-recipe:

Basic recipe
------------

Methods for working with the Dataset Zoo are conveniently exposed via the
Python library and the CLI. The basic recipe for loading a zoo dataset and
visualizing it in the App is shown below.

.. tabs::

  .. group-tab:: Python

    Use :meth:`load_zoo_dataset() <fiftyone.zoo.datasets.load_zoo_dataset>` to
    load a zoo dataset into a FiftyOne dataset.

    For example, the code sample below loads the validation split of
    :ref:`COCO-2017 <dataset-zoo-coco-2017>` from the zoo and visualizes it in
    the FiftyOne App:

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        # List available zoo datasets
        print(foz.list_zoo_datasets())

        #
        # Load the COCO-2017 validation split into a FiftyOne dataset
        #
        # This will download the dataset from the web, if necessary
        #
        dataset = foz.load_zoo_dataset("coco-2017", split="validation")

        # Give the dataset a new name, and make it persistent so that you can
        # work with it in future sessions
        dataset.name = "coco-2017-validation-example"
        dataset.persistent = True

        # Visualize the in the App
        session = fo.launch_app(dataset)

  .. group-tab:: CLI

    Use :ref:`fiftyone zoo datasets load <cli-fiftyone-zoo-datasets-load>` to
    load a zoo dataset into a FiftyOne dataset.

    For example, the code sample below loads the validation split of
    :ref:`COCO-2017 <dataset-zoo-coco-2017>` from the zoo and visualizes it in
    the FiftyOne App:

    .. code-block:: shell

        #
        # Load the COCO-2017 validation split into a FiftyOne dataset called
        # `coco-2017-validation-example`
        #
        # This will download the dataset from the web, if necessary
        #
        fiftyone zoo datasets load coco-2017 --split validation \
            --dataset-name coco-2017-validation-example

        # Visualize the dataset in the App
        fiftyone app launch coco-2017-validation-example

.. image:: /images/dataset_zoo_coco_2017.png
   :alt: Dataset Zoo
   :align: center

.. toctree::
   :maxdepth: 1
   :hidden:

   API reference <api>
   Available datasets <datasets>
