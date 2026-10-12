.. _dataset-zoo-tum-rgbd:

TUM RGB-D
---------

.. default-role:: code

The TUM RGB-D SLAM benchmark, as native `.mcap` episodes.

A Microsoft Kinect records color and depth at 640x480 and 30 Hz while an
eight-camera motion-capture system tracks it at 100 Hz, handheld, on a Pioneer
robot, and over scenes built to test structure against texture, moving people
and object reconstruction. Each episode carries the color images, the depth
images as the benchmark ships them, the ground-truth pose and the Kinect's
intrinsics, and on the freiburg1 and freiburg2 sequences the Kinect's
accelerometer.

47 sequences in six categories, 48 minutes 12 seconds of recording, 81,413
color frames and 80,683 depth frames.

**Details**

-   Dataset name: ``tum-rgbd``
-   Dataset source: https://huggingface.co/datasets/Voxel51/TUM-RGBD
-   Dataset size: 8.12 GB
-   Dataset license: CC-BY-4.0
-   Tags: ``multimodal, mcap, rgbd, slam, robotics``
-   Supported splits: ``N/A``
-   ZooDataset class:
    :class:`TUMRGBDDataset <fiftyone.zoo.datasets.base.TUMRGBDDataset>`

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz
        from fiftyone import ViewField as F

        dataset = foz.load_zoo_dataset("tum-rgbd")

        # The sequences with people moving through the scene
        view = dataset.match(F("category") == "Dynamic Objects")

        session = fo.launch_app(dataset, view=view)

  .. group-tab:: CLI

    .. code-block:: shell

        fiftyone zoo datasets load tum-rgbd

        fiftyone app launch tum-rgbd

.. image:: /images/dataset_zoo/tum-rgbd.png
   :alt: tum-rgbd
   :align: center
