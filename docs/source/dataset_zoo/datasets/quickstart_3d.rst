.. _dataset-zoo-quickstart-3d:

Quickstart 3D
-------------

.. default-role:: code

A small 3D dataset with meshes, point clouds, and oriented bounding boxes.

The dataset consists of 200 3D mesh samples from the test split of the
`ModelNet40 <https://modelnet.cs.princeton.edu>`_ dataset, with point
clouds generated using a Poisson disk sampling method, and oriented
bounding boxes generated based on the convex hull.

Objects have been rescaled and recentered from the original dataset.

**Details**

-   Dataset name: ``quickstart-3d``
-   Dataset size: 215.7 MB
-   Dataset license: https://modelnet.cs.princeton.edu
-   Tags: ``3d, point-cloud, mesh, quickstart``
-   Supported splits: ``N/A``
-   ZooDataset class:
    :class:`Quickstart3DDataset <fiftyone.zoo.datasets.base.Quickstart3DDataset>`

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("quickstart-3d")

        session = fo.launch_app(dataset)

  .. group-tab:: CLI

    .. code-block:: shell

        fiftyone zoo datasets load quickstart-3d

        fiftyone app launch quickstart-3d

.. image:: /images/dataset_zoo/quickstart-3d.png
   :alt: quickstart-3d
   :align: center
