.. _dataset-zoo:

FiftyOne Dataset Zoo
====================

.. default-role:: code

The FiftyOne Dataset Zoo provides a powerful interface for downloading datasets
and loading them into FiftyOne.

It provides native access to dozens of popular benchmark datasets, and it also
supports downloading arbitrary public or private datasets whose
download/preparation methods are provided via GitHub repositories or URLs.

Built-in datasets
-----------------

The Dataset Zoo provides built-in access to dozens of datasets that you can
load into FiftyOne with a single command.

.. custombutton::
    :button_text: Explore the datasets in the zoo
    :button_link: datasets.html

__SUB_NEW__ Remotely-sourced datasets
-------------------------------------

The Dataset Zoo also supports loading datasets whose download/preparation
methods are provided via GitHub repositories or URLs.

.. custombutton::
    :button_text: Learn how to download remote datasets
    :button_link: remote.html

API reference
-------------

The Dataset Zoo can be accessed via the Python library and the CLI. Consult the
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

        # Download the COCO-2017 validation split and load it into FiftyOne
        dataset = foz.load_zoo_dataset("coco-2017", split="validation")

        # Give the dataset a new name, and make it persistent
        dataset.name = "coco-2017-validation-example"
        dataset.persistent = True

        # Visualize it in the App
        session = fo.launch_app(dataset)

  .. group-tab:: CLI

    Use :ref:`fiftyone zoo datasets load <cli-fiftyone-zoo-datasets-load>` to
    load a zoo dataset into a FiftyOne dataset.

    For example, the code sample below loads the validation split of
    :ref:`COCO-2017 <dataset-zoo-coco-2017>` from the zoo and visualizes it in
    the FiftyOne App:

    .. code-block:: shell

        # List available zoo datasets
        fiftyone zoo datasets list

        # Download the COCO-2017 validation split and load it into FiftyOne
        fiftyone zoo datasets load coco-2017 --split validation \
            --dataset-name coco-2017-validation-example

        # Visualize it in the App
        fiftyone app launch coco-2017-validation-example

.. image:: /images/dataset_zoo_coco_2017.png
   :alt: Dataset Zoo
   :align: center

.. toctree::
   :maxdepth: 1
   :hidden:

   Built-in datasets <datasets>
   Remote datasets <remote>
   API reference <api>
