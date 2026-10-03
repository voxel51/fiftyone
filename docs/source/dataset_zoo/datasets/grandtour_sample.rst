.. _dataset-zoo-grandtour-sample:

GrandTour Sample
----------------

.. default-role:: code

A sample of the GrandTour legged robotics dataset, as native `.mcap` episodes.

An ANYmal D quadruped from ETH Zurich's Robotic Systems Lab carries the Boxi
sensor payload through cities, buildings, forests, mountains and ice: HDR and
depth cameras, a Hesai LiDAR, a tactical-grade inertial unit, a GNSS/INS
receiver and the robot's own joint sensing, with a total station tracking a
prism on the payload for reference.

3 missions, 13 minutes 33 seconds of walking, 24,390 HDR camera frames,
12,701 depth frames and 8,363 LiDAR scans holding 433.5 million points. The
missions cross ice on the Jungfraujoch, the main hall of ETH Zurich and a
muddy forest slope on the Uetliberg.

**Details**

-   Dataset name: ``grandtour-sample``
-   Dataset source: https://huggingface.co/datasets/Voxel51/GrandTour-Sample
-   Dataset size: 15.92 GB
-   Dataset license: MIT
-   Tags: ``multimodal, mcap, robotics, legged, lidar``
-   Supported splits: ``N/A``
-   ZooDataset class:
    :class:`GrandTourSampleDataset <fiftyone.zoo.datasets.base.GrandTourSampleDataset>`

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("grandtour-sample")

        # The longest walk
        view = dataset.sort_by("lidar_odometry_path_m", reverse=True)

        session = fo.launch_app(dataset, view=view)

  .. group-tab:: CLI

    .. code-block:: shell

        fiftyone zoo datasets load grandtour-sample

        fiftyone app launch grandtour-sample

.. image:: /images/dataset_zoo/grandtour-sample.png
   :alt: grandtour-sample
   :align: center
