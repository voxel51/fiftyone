.. _dataset-zoo-citrusfarm-sample:

CitrusFarm Sample
-----------------

.. default-role:: code

A sample of the CitrusFarm multimodal agricultural robotics dataset, as a
native `.mcap` episode.

A Clearpath Jackal drives the rows of citrus trees at the University of
California Riverside's Agricultural Experimental Station carrying a monochrome
camera, a thermal camera, a camera that sees red, green and near-infrared, a
ZED 2i stereo camera with its depth, a Velodyne LiDAR, an inertial unit and a
GPS-RTK receiver. The episode carries every camera, the stereo depth, the LiDAR
scans, the GPS-RTK fixes, the wheel and visual odometry and the ground-truth
trajectory on one clock.

One sequence, 5 minutes of driving over 357 m: 3,026 monochrome, 3,024
thermal, 3,025 red-green-NIR and 3,022 stereo frames and 2,998 LiDAR scans.

**Details**

-   Dataset name: ``citrusfarm-sample``
-   Dataset source: https://huggingface.co/datasets/Voxel51/CitrusFarm-Sample
-   Dataset size: 2.50 GB
-   Dataset license: CC-BY-SA-4.0
-   Tags: ``multimodal, mcap, agriculture, thermal, multispectral, lidar``
-   Supported splits: ``N/A``
-   ZooDataset class:
    :class:`CitrusFarmSampleDataset <fiftyone.zoo.datasets.base.CitrusFarmSampleDataset>`

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("citrusfarm-sample")

        session = fo.launch_app(dataset)

  .. group-tab:: CLI

    .. code-block:: shell

        fiftyone zoo datasets load citrusfarm-sample

        fiftyone app launch citrusfarm-sample

.. image:: /images/dataset_zoo/citrusfarm-sample.png
   :alt: citrusfarm-sample
   :align: center
