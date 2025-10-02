.. _dataset-zoo-caltech256:

Caltech-256
-----------

The Caltech-256 dataset of images.

The dataset consists of pictures of objects belonging to 256 classes, plus
one background clutter class (``clutter``). Each image is labelled with a
single object.

Each class contains between 80 and 827 images, totalling 30,607 images.
Images are of variable sizes, with typical edge lengths of 80-800 pixels.

**Details**

-   Dataset name: ``caltech256``
-   Dataset source: https://data.caltech.edu/records/nyy15-4j048
-   Dataset license: CC-BY-4.0
-   Dataset size: 1.16 GB
-   Tags: ``image, classification``
-   Supported splits: ``N/A``
-   ZooDataset class:
    :class:`Caltech256Dataset <fiftyone.zoo.datasets.base.Caltech256Dataset>`

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("caltech256")

        session = fo.launch_app(dataset)

  .. group-tab:: CLI

    .. code-block:: shell

        fiftyone zoo datasets load caltech256

        fiftyone app launch caltech256

.. image:: /images/dataset_zoo/caltech256.png
   :alt: caltech256
   :align: center