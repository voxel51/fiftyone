Creating FiftyOne Datasets
==========================

.. include:: ../../substitutions.rst
.. default-role:: code

FiftyOne supports automatic creation of datasets stored in various common
formats. If your dataset is stored in a custom format, don't worry, FiftyOne
also provides support for easily loading datasets in custom formats.

.. note::

    When you create a FiftyOne |Dataset2|_, its samples and all of their fields
    (metadata, labels, custom fields, etc.) are written to FiftyOne's backing
    database.

    Note, however, that samples only store the `filepath` to the media, not the
    raw media itself. FiftyOne does not create duplicate copies of your data!

Quickstart
----------

Ingest a directory of images into FiftyOne and explore them in the FiftyOne
App:

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        dataset_dir = "/path/to/images-dir"

        # Visualize a directory of images in the FiftyOne App
        dataset = fo.Dataset.from_dir(dataset_dir, fo.types.ImageDirectory)
        session = fo.launch_app(dataset=dataset)

  .. group-tab:: CLI

    .. code:: shell

        # Visualize a directory of images in the FiftyOne App
        fiftyone app view \
            --dataset-dir /path/to/images-dir --type fiftyone.types.ImageDirectory

Loading datasets
----------------

There are three basic ways to get data into FiftyOne:

- :doc:`Loading datasets from disk<datasets>`

FiftyOne natively supports creating datasets in a variety of common formats,
including
`COCO <https://cocodataset.org/#home>`_,
`VOC <http://host.robots.ox.ac.uk/pascal/VOC>`_,
`CVAT <https://github.com/opencv/cvat>`_,
`BDD <https://bdd-data.berkeley.edu>`_,
`TFRecords <https://github.com/tensorflow/models/tree/master/research/object_detection>`_,
and more. You can also extend FiftyOne by providing your own |DatasetImporter|
to load datasets in your own custom formats.

- :doc:`Adding samples to datasets<samples>`

FiftyOne provides a number of options for building datasets from samples. You
can take a fully customized approach and build your own |Sample| instances, or
you can a builtin |SampleParser| clasess to parse samples from a variety of
common formats, or you can provide your own |SampleParser| to automatically
load samples in your own custom formats.

- :doc:`Zoo datasets<zoo>`

FiftyOne provides a Dataset Zoo that contains a variety of popular open source
datasets like
`CIFAR-10 <https://www.cs.toronto.edu/~kriz/cifar.html>`_,
`COCO <https://cocodataset.org/#home>`_, and
`ImageNet <http://www.image-net.org>`_
that can be downloaded and loaded into FiftyOne with a single line of code.

.. toctree::
   :maxdepth: 1
   :hidden:

   Loading datasets <datasets>
   Loading samples <samples>
   Zoo datasets <zoo>