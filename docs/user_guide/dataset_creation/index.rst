Loading a Dataset
=================

.. default-role:: code

FiftyOne supports automatic loading of datasets stored in various common
formats. If your dataset is stored in a custom format, don't worry, FiftyOne
also provides support for easily loading custom data formats as well.

Dataset formats
_______________

There are three basic ways to load data into FiftyOne:

.. rubric:: :doc:`Common format datasets<common_datasets>`

FiftyOne natively supports loading datasets in a variety of common formats,
including COCO, VOC, CVAT, BDD, TFRecords, and more. See the
:doc:`common format datasets<common_datasets>` page for more information.

.. rubric:: :doc:`Zoo datasets<zoo_datasets>`

FiftyOne provides a Dataset Zoo that contains a variety of popular open source
datasets like CIFAR-10, COCO, and ImageNet that can be downloaded and loaded
into FiftyOne via a single line of code. See the
:doc:`zoo datasets<zoo_datasets>` page for more information.

.. rubric:: :doc:`Custom format datasets<custom_datasets>`

If your data is stored in a custom format, you can easily load it into FiftyOne
by directly adding the samples and their fields to a FiftyOne Dataset in a
variety of formats. You can even provide your own sample parser to automate
this process. See the :doc:`custom format datasets<custom_datasets>` page for more
information.

Quickstart
__________

Load a directory of images into FiftyOne and explore them in the FiftyOne App
by running the following commands in Python:

.. code-block:: python

    import fiftyone as fo

    dataset_dir = "/path/to/images-dir"

    # Create the dataset
    dataset = fo.Dataset.from_dir(dataset_dir, fo.types.ImageDirectory)

    # Visualize the dataset
    session = fo.launch_dashboard(dataset=dataset)

Or, perform the same action via the CLI:

.. code:: shell

    # Visualize a directory of images in the FityOne App
    fiftyone datasets view \
        --dataset-dir /path/to/images-dir --type fiftyone.types.ImageDirectory

.. toctree::
   :maxdepth: 1
   :hidden:

   Common Format Datasets <common_datasets>
   Zoo Datasets <zoo_datasets>
   Custom Format Datasets <custom_datasets>
