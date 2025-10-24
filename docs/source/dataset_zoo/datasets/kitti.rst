.. _dataset-zoo-kitti:

KITTI
-----

.. default-role:: code

KITTI contains a suite of vision tasks built using an autonomous
driving platform.

This dataset contains the left camera images and the associated 2D object
detections.

The training split contains 7,481 annotated images, and the test split contains
7,518 unlabeled images.

A full description of the annotations can be found in the README of the
object development kit on the KITTI homepage.

**Details**

-   Dataset name: ``kitti``
-   Dataset source: http://www.cvlibs.net/datasets/kitti
-   Dataset license: CC-BY-NC-SA-3.0
-   Dataset size: 12.57 GB
-   Tags: ``image, detection``
-   Supported splits: ``train, test``
-   ZooDataset class:
    :class:`KITTIDataset <fiftyone.zoo.datasets.base.KITTIDataset>`

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("kitti", split="train")

        session = fo.launch_app(dataset)

  .. group-tab:: CLI

    .. code-block:: shell

        fiftyone zoo datasets load kitti --split train

        fiftyone app launch kitti-train

.. image:: /images/dataset_zoo/kitti-train.png
   :alt: kitti-train
   :align: center
