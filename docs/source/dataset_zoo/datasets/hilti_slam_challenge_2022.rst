.. _dataset-zoo-hilti-slam-challenge-2022:

Hilti SLAM Challenge 2022
-------------------------

.. default-role:: code

The Hilti SLAM Challenge 2022 recordings, as native `.mcap` episodes.

The recordings were made with a handheld rig called Phasma, which carries five
synchronized global-shutter cameras, a Hesai PandarXT-32 LiDAR and a Bosch
BMI085 IMU. Seven runs were walked through an active construction site in
Schaan, Liechtenstein, and nine through the Sheldonian Theatre in Oxford, over
five days in March and April 2022. A surveyor measured reference positions
along every run, and three runs also carry a continuous reference trajectory.

Camera frames are published at 10 Hz, on the LiDAR's clock, rather than the
40 Hz the bags record. `exp23_the_sheldonian_slam` is one run stored as three
episodes sharing a `sequence` and differing in `part`, which is why sixteen
runs arrive as eighteen episodes.

**Details**

-   Dataset name: ``hilti-slam-challenge-2022``
-   Dataset source: https://huggingface.co/datasets/Voxel51/Hilti-SLAM-Challenge-2022
-   Dataset size: 49.70 GB
-   Dataset license: CC-BY-NC-SA-3.0
-   Tags: ``multimodal, mcap, slam, lidar, imu``
-   Supported splits: ``N/A``
-   ZooDataset class:
    :class:`HiltiSLAMChallenge2022Dataset <fiftyone.zoo.datasets.base.HiltiSLAMChallenge2022Dataset>`

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("hilti-slam-challenge-2022")

        # The runs with a continuous reference trajectory
        view = dataset.match({"has_dense_ground_truth": True})

        session = fo.launch_app(dataset)

  .. group-tab:: CLI

    .. code-block:: shell

        fiftyone zoo datasets load hilti-slam-challenge-2022

        fiftyone app launch hilti-slam-challenge-2022

.. image:: /images/dataset_zoo/hilti-slam-challenge-2022.png
   :alt: hilti-slam-challenge-2022
   :align: center
