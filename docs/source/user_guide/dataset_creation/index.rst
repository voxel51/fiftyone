Creating a Dataset
==================

.. default-role:: code

FiftyOne supports automatic creation of datasets stored in various common
formats. If your dataset is stored in a custom format, don't worry, FiftyOne
also provides support for easily create custom data formats as well.

.. note::

    When you create a FiftyOne `Dataset`, its samples and all of their fields
    (metadata, labels, custom fields, etc.) are written to FiftyOne's backing
    database.

    Note, however, that samples only store the `filepath` to the media, not the
    raw media itself; FiftyOne does not create duplicate copies of your data!

**Dataset formats**

There are three basic ways to get data into FiftyOne:

- :doc:`Common format datasets<common_datasets>`

  - FiftyOne natively supports creating datasets in a variety of common
    formats, including
    `COCO <https://cocodataset.org/#home>`_,
    `VOC <http://host.robots.ox.ac.uk/pascal/VOC>`_,
    `CVAT <https://github.com/opencv/cvat>`_,
    `BDD <https://bdd-data.berkeley.edu>`_,
    `TFRecords <https://github.com/tensorflow/models/tree/master/research/object_detection>`_,
    and more.

- :doc:`Zoo datasets<zoo_datasets>`

  - FiftyOne provides a Dataset Zoo that contains a variety of popular open
    source datasets like
    `CIFAR-10 <https://www.cs.toronto.edu/~kriz/cifar.html>`_,
    `COCO <https://cocodataset.org/#home>`_, and
    `ImageNet <http://www.image-net.org>`_
    that can be downloaded and loaded into FiftyOne with a single line of
    code.

- :doc:`Custom format datasets<custom_datasets>`

  - If your data is stored in a custom format, you can easily get it into
    FiftyOne by directly adding the samples and their fields to a FiftyOne
    Dataset in a variety of formats. You can even provide your own sample
    parser to automate this process.

**Quickstart**

Ingest a directory of images into FiftyOne and explore them in the FiftyOne
App:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python

        import fiftyone as fo

        dataset_dir = "/path/to/images-dir"

        # Visualize a directory of images in the FiftyOne App
        dataset = fo.Dataset.from_dir(dataset_dir, fo.types.ImageDirectory)
        session = fo.launch_dashboard(dataset=dataset)

  .. group-tab:: CLI

    .. code:: shell

        # Visualize a directory of images in the FiftyOne App
        fiftyone dashboard view \
            --dataset-dir /path/to/images-dir --type fiftyone.types.ImageDirectory

.. toctree::
   :maxdepth: 1
   :hidden:

   Common format datasets <common_datasets>
   Zoo datasets <zoo_datasets>
   Custom format datasets <custom_datasets>
