.. _dataset-zoo-m3ed-sample:

M3ED Sample
-----------

.. default-role:: code

A sample of M3ED, the multi-robot, multi-sensor, multi-environment event
camera dataset, as native `.mcap` episodes.

A car, a quadrotor and a Boston Dynamics Spot carry the same sensor head: a
stereo pair of Prophesee event cameras at 1280x720, a stereo pair of grayscale
cameras and a color camera at 1280x800, an inertial unit and an Ouster OS1-64
LiDAR. Each episode carries every event of both event cameras as point clouds,
one per 1/30 s window, beside a render of each window, with the cameras, the
LiDAR scans and the ground-truth poses and depth.

3 sequences, one per platform: a city street by day, a quadrotor flight
outdoors at night and an indoor stairwell, 192 seconds in all with
3,631,437,863 events, 4,802 image triplets and 1,921 LiDAR scans.

**Details**

-   Dataset name: ``m3ed-sample``
-   Dataset source: https://huggingface.co/datasets/Voxel51/M3ED-Sample
-   Dataset size: 22.13 GB
-   Dataset license: CC-BY-SA-4.0
-   Tags: ``multimodal, mcap, event-camera, stereo, lidar``
-   Supported splits: ``N/A``
-   ZooDataset class:
    :class:`M3EDSampleDataset <fiftyone.zoo.datasets.base.M3EDSampleDataset>`

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("m3ed-sample")

        # The sequences with the busiest event streams
        view = dataset.sort_by("peak_event_rate_mev_s", reverse=True)

        session = fo.launch_app(dataset, view=view)

  .. group-tab:: CLI

    .. code-block:: shell

        fiftyone zoo datasets load m3ed-sample

        fiftyone app launch m3ed-sample

.. image:: /images/dataset_zoo/m3ed-sample.png
   :alt: m3ed-sample
   :align: center
