.. _dataset-zoo-kitti-multiview:

KITTI Multiview
---------------

KITTI contains a suite of vision tasks built using an autonomous
driving platform.

This dataset contains the following multiview data for each scene:

-   Left camera images annotated with 2D object detections
-   Right camera images annotated with 2D object detections
-   Velodyne LIDAR point clouds annotated with 3D object detections

The training split contains 7,481 annotated scenes, and the test split contains
7,518 unlabeled scenes.

A full description of the annotations can be found in the README of the
object development kit on the KITTI homepage.

**Details**

-   Dataset name: ``kitti-multiview``
-   Dataset source: http://www.cvlibs.net/datasets/kitti
-   Dataset license: CC-BY-NC-SA-3.0
-   Dataset size: 53.34 GB
-   Tags: ``image, point-cloud, detection``
-   Supported splits: ``train, test``
-   ZooDataset class:
    :class:`KITTIMultiviewDataset <fiftyone.zoo.datasets.base.KITTIMultiviewDataset>`

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("kitti-multiview", split="train")

        session = fo.launch_app(dataset)

  .. group-tab:: CLI

    .. code-block:: shell

        fiftyone zoo datasets load kitti-multiview --split train

        fiftyone app launch kitti-multiview-train

.. image:: /images/dataset_zoo/kitti-multiview-train.png
   :alt: kitti-multiview-train
   :align: center
