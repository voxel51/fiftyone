.. _dataset-zoo-sew-multimodal-amr:

SEW Multimodal AMR
------------------

.. default-role:: code

The labeled test set of the SEW-EURODRIVE Multimodal AMR dataset, as native
`.mcap` episodes.

Six sensing modalities ride one autonomous mobile robot: RGB, thermal,
time-of-flight, 4D radar, two 2D laser scanners, and an ultrasonic array. The
3,151 labeled frames are split into 55 episodes, one per source recording
session, spanning three seasons, six weather conditions, and day, dawn, and
night. KITTI cuboids and YOLO boxes ride the timeline as scene and image
annotations.

**Details**

-   Dataset name: ``sew-multimodal-amr``
-   Dataset source: https://huggingface.co/datasets/Voxel51/SEW-Multimodal-AMR
-   Dataset size: 3.97 GB
-   Dataset license: CC-BY-SA-4.0
-   Tags: ``multimodal, mcap, robotics, thermal, radar``
-   Supported splits: ``N/A``
-   ZooDataset class:
    :class:`SEWMultimodalAMRDataset <fiftyone.zoo.datasets.base.SEWMultimodalAMRDataset>`

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("sew-multimodal-amr")

        session = fo.launch_app(dataset)

  .. group-tab:: CLI

    .. code-block:: shell

        fiftyone zoo datasets load sew-multimodal-amr

        fiftyone app launch sew-multimodal-amr

.. image:: /images/dataset_zoo/sew-multimodal-amr.png
   :alt: sew-multimodal-amr
   :align: center
