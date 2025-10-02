.. _dataset-zoo-places:

Places
------

Places is a scene recognition dataset of 10 million images comprising ~400
unique scene categories.

The images are labeled with scene semantic categories, comprising a large
and diverse list of the types of environments encountered in the world.

**Details**

-   Dataset name: ``places``
-   Dataset source: http://places2.csail.mit.edu/download-private.html
-   Dataset size: 29 GB
-   Tags: ``image, classification``
-   Supported splits: ``train, validation, test``
-   ZooDataset classes:
    :class:`PlacesDataset <fiftyone.zoo.datasets.base.PlacesDataset>`

**Full split stats**

-   Train split: 1,803,460 images, with between 3,068 and 5,000 per category
-   Test split: 328,500 images, with 900 images per category
-   Validation split: 36,500 images, with 100 images per category

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("places", split="validation")

        session = fo.launch_app(dataset)

  .. group-tab:: CLI

    .. code-block:: shell

        fiftyone zoo datasets load places --split validation

        fiftyone app launch places-validation

.. image:: /images/dataset_zoo/places-validation.png
   :alt: places-validation
   :align: center