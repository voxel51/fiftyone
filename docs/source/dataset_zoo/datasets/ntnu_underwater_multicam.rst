.. _dataset-zoo-ntnu-underwater-multicam:

NTNU Underwater Multi-Camera
----------------------------

.. default-role:: code

Piloted underwater robot runs with five cameras and an inertial unit, as
native `.mcap` episodes.

Ariel, the NTNU Autonomous Robots Lab's underwater robot built on the BlueROV2
Heavy configuration, is piloted through the Trondheim Fjord and the Marine
Cybernetics Laboratory pool. An Alphasense rig records five monochrome
cameras, a forward stereo pair and cameras looking up, left and right, with a
200 Hz inertial unit, while the vehicle's autopilot logs a second inertial
unit, a barometer, a downward rangefinder and the thruster outputs. Each run
carries the authors' ReAqROVIO reference trajectory and the rig's calibration.

8 runs, 6 in the fjord and 2 in the pool, 63 minutes 19 seconds of recording,
379,896 camera frames and 759,943 inertial samples over 1,439 m of reference
trajectory.

**Details**

-   Dataset name: ``ntnu-underwater-multicam``
-   Dataset source: https://huggingface.co/datasets/Voxel51/NTNU-Underwater-Multicam
-   Dataset size: 1.31 GB
-   Dataset license: BSD-3-Clause
-   Tags: ``multimodal, mcap, underwater, robotics, slam``
-   Supported splits: ``N/A``
-   ZooDataset class:
    :class:`NTNUUnderwaterMulticamDataset <fiftyone.zoo.datasets.base.NTNUUnderwaterMulticamDataset>`

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("ntnu-underwater-multicam")

        # The deepest dives
        view = dataset.sort_by("max_depth_m", reverse=True)

        session = fo.launch_app(dataset, view=view)

  .. group-tab:: CLI

    .. code-block:: shell

        fiftyone zoo datasets load ntnu-underwater-multicam

        fiftyone app launch ntnu-underwater-multicam

.. image:: /images/dataset_zoo/ntnu-underwater-multicam.png
   :alt: ntnu-underwater-multicam
   :align: center
