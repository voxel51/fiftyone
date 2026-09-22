.. _dataset-zoo-rtk-slam-absolute-accuracy:

RTK-SLAM Absolute Accuracy
--------------------------

.. default-role:: code

Handheld LiDAR, camera, IMU and GNSS sequences measured against surveyed
checkpoints, as native `.mcap` episodes.

A handheld rig carrying a Livox MID360, a global shutter camera and a GNSS
receiver is walked through a public park and a construction hall. Both block
the sky in places, including a 30 m underpass and an indoor hall spanning
more than 400 seconds of the route.

The reference is not the GNSS. A geodetic total station surveyed 87
checkpoints along the routes independently, so absolute error can be measured
without first fitting the estimate onto the reference. Three published
trajectories are carried alongside the sensors, together with each one's
distance to every checkpoint.

Four sequences and 64.6 minutes of walking, over 76,409 camera frames, 38,175
LiDAR sweeps, 763,673 IMU samples and 38,202 GNSS fixes.

**Details**

-   Dataset name: ``rtk-slam-absolute-accuracy``
-   Dataset source: https://huggingface.co/datasets/Voxel51/RTK-SLAM-Absolute-Accuracy
-   Dataset size: 10.85 GB
-   Dataset license: CC BY 4.0
-   Tags: ``multimodal, mcap, slam, lidar, gnss, ground-truth``
-   Supported splits: ``N/A``
-   ZooDataset class:
    :class:`RTKSLAMAbsoluteAccuracyDataset <fiftyone.zoo.datasets.base.RTKSLAMAbsoluteAccuracyDataset>`

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("rtk-slam-absolute-accuracy")

        # Where the sky was hardest to see
        view = dataset.sort_by("gnss_fix_rate")

        # The routes that go indoors
        view = dataset.match({"site": "construction"})

        session = fo.launch_app(dataset)

  .. group-tab:: CLI

    .. code-block:: shell

        fiftyone zoo datasets load rtk-slam-absolute-accuracy

        fiftyone app launch rtk-slam-absolute-accuracy

.. image:: /images/dataset_zoo/rtk-slam-absolute-accuracy.png
   :alt: rtk-slam-absolute-accuracy
   :align: center
