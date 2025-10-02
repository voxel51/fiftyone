.. _dataset-zoo-quickstart-groups:

Quickstart Groups
-----------------

A small dataset with grouped image and point cloud data.

The dataset consists of 200 scenes from the train split of the KITTI dataset,
each containing left camera, right camera, point cloud, and 2D/3D object
annotation data.

**Details**

-   Dataset name: ``quickstart-groups``
-   Dataset size: 516.3 MB
-   Dataset license: CC-BY-NC-SA-3.0
-   Tags: ``image, point-cloud, quickstart``
-   Supported splits: ``N/A``
-   ZooDataset class:
    :class:`QuickstartGroupsDataset <fiftyone.zoo.datasets.base.QuickstartGroupsDataset>`

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("quickstart-groups")

        session = fo.launch_app(dataset)

  .. group-tab:: CLI

    .. code-block:: shell

        fiftyone zoo datasets load quickstart-groups

        fiftyone app launch quickstart-groups

.. image:: /images/dataset_zoo/quickstart-groups.png
   :alt: quickstart-groups
   :align: center