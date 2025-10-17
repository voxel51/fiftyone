.. _dataset-zoo-quickstart-geo:

Quickstart Geo
--------------

.. default-role:: code

A small dataset with geolocation data.

The dataset consists of 500 images from the validation split of the BDD100K
dataset in the New York City area with object detections and GPS timestamps.

**Details**

-   Dataset name: ``quickstart-geo``
-   Dataset size: 33.50 MB
-   Tags: ``image, location, quickstart``
-   Supported splits: ``N/A``
-   ZooDataset class:
    :class:`QuickstartGeoDataset <fiftyone.zoo.datasets.base.QuickstartGeoDataset>`

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("quickstart-geo")

        session = fo.launch_app(dataset)

  .. group-tab:: CLI

    .. code-block:: shell

        fiftyone zoo datasets load quickstart-geo

        fiftyone app launch quickstart-geo

.. image:: /images/dataset_zoo/quickstart-geo.png
   :alt: quickstart-geo
   :align: center
