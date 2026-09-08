.. _dataset-zoo-tii-ratm-drone-racing:

TII-RATM Drone Racing
---------------------

.. default-role:: code

Indoor drone racing flights pairing onboard visual-inertial odometry with
motion capture ground truth, as native `.mcap` episodes.

A quadrotor flies laps of a four-gate track, three on an ellipse and three on
a lemniscate, carrying a fisheye camera and a 500 Hz IMU while a motion
capture system watches the room.

Each episode carries both numbers: the estimate the drone computed from its
own camera and IMU, and the reference the capture system measured at the same
instant. The distance between them is published as a per-pose series, so the
error is measurable rather than assumed.

Six flights, 10.9 minutes and 2,563 metres flown, over 17,305 camera frames,
327,086 IMU samples, 293,219 odometry poses and 179,283 capture poses.
Tracking error ranges from 0.61 m to 1.66 m RMSE across the six.

**Details**

-   Dataset name: ``tii-ratm-drone-racing``
-   Dataset source: https://huggingface.co/datasets/Voxel51/TII-RATM-Drone-Racing
-   Dataset size: 0.58 GB
-   Dataset license: CC BY 4.0
-   Tags: ``multimodal, mcap, drone, uav, slam, ground-truth``
-   Supported splits: ``N/A``
-   ZooDataset class:
    :class:`TIIRATMDroneRacingDataset <fiftyone.zoo.datasets.base.TIIRATMDroneRacingDataset>`

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("tii-ratm-drone-racing")

        # The flights the odometry found hardest
        view = dataset.sort_by("tracking_error_rmse_m", reverse=True)

        # The lemniscate laps
        view = dataset.match({"track": "lemniscate"})

        session = fo.launch_app(dataset)

  .. group-tab:: CLI

    .. code-block:: shell

        fiftyone zoo datasets load tii-ratm-drone-racing

        fiftyone app launch tii-ratm-drone-racing

.. image:: /images/dataset_zoo/tii-ratm-drone-racing.png
   :alt: tii-ratm-drone-racing
   :align: center
