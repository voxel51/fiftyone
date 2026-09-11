.. _dataset-zoo-hilti-slam-challenge-2023:

Hilti SLAM Challenge 2023
-------------------------

.. default-role:: code

Multi-session, multi-platform SLAM recordings from three active construction
sites, as native `.mcap` episodes.

The 2023 challenge extends the Hilti benchmark to runs that overlap each
other, so a sequence can be solved on its own or several can be combined
into one map of a site.

Two rigs recorded it. The handheld platform is the Phasma-style suite
carried over from the 2022 challenge: five synchronized global-shutter
cameras at 720x540, a Hesai PandarXT-32 LiDAR and an inertial unit, locked
together by an FPGA and PTP to within about a millisecond. The robot is a
tracked drilling platform carrying four OAK-D stereo pairs, so eight camera
streams at 1280x800, a RoboSense BPearl hemispherical LiDAR and an Xsens
MTi-670. A surveyor measured reference positions along every run.

Fifteen runs and 55.7 minutes of recording, over 207,825 camera frames,
33,401 LiDAR sweeps holding 1.98 billion points, 1,061,139 inertial samples
and 63 surveyed reference positions.

.. note::

    The three additional Site 2 handheld runs carry rapidly flashing lights
    in their camera streams, which the source flags as a photosensitivity
    risk. Every episode carries ``has_flashing_lights`` so they can be
    excluded before the App is opened.

**Details**

-   Dataset name: ``hilti-slam-challenge-2023``
-   Dataset source: https://huggingface.co/datasets/Voxel51/Hilti-SLAM-Challenge-2023
-   Dataset size: 53.41 GB
-   Dataset license: CC BY-NC-SA 3.0
-   Tags: ``multimodal, mcap, slam, lidar, imu``
-   Supported splits: ``N/A``
-   ZooDataset class:
    :class:`HiltiSLAMChallenge2023Dataset <fiftyone.zoo.datasets.base.HiltiSLAMChallenge2023Dataset>`

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("hilti-slam-challenge-2023")

        # Everything except the runs with flashing lights
        view = dataset.match({"has_flashing_lights": False})

        # The runs recorded from the robot rather than by hand
        view = dataset.match({"platform": "robot"})

        session = fo.launch_app(dataset, view=view)

  .. group-tab:: CLI

    .. code-block:: shell

        fiftyone zoo datasets load hilti-slam-challenge-2023

        fiftyone app launch hilti-slam-challenge-2023

.. image:: /images/dataset_zoo/hilti-slam-challenge-2023.png
   :alt: hilti-slam-challenge-2023
   :align: center
