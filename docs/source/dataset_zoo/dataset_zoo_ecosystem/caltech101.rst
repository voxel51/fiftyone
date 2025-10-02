.. _dataset-zoo-caltech101:

Caltech-101
-----------

The Caltech-101 dataset of images.

The dataset consists of pictures of objects belonging to 101 classes, plus
one background clutter class (``BACKGROUND_Google``). Each image is labelled
with a single object.

Each class contains roughly 40 to 800 images, totalling around 9,000
images. Images are of variable sizes, with typical edge lengths of 200-300
pixels. This version contains image-level labels only.

**Details**

-   Dataset name: ``caltech101``
-   Dataset source: https://data.caltech.edu/records/mzrjq-6wc02
-   Dataset license: CC-BY-4.0
-   Dataset size: 138.60 MB
-   Tags: ``image, classification``
-   Supported splits: ``N/A``
-   ZooDataset class:
    :class:`Caltech101Dataset <fiftyone.zoo.datasets.base.Caltech101Dataset>`

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("caltech101")

        session = fo.launch_app(dataset)

  .. group-tab:: CLI

    .. code-block:: shell

        fiftyone zoo datasets load caltech101

        fiftyone app launch caltech101

.. image:: /images/dataset_zoo/caltech101.png
   :alt: caltech101
   :align: center