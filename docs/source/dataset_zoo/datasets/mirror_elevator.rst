.. _dataset-zoo-mirror-elevator:

MirrorSentinel Elevator
-----------------------

.. default-role:: code

Elevator traversals recorded to study mirror and glass interference, as native
`.mcap` episodes.

A rig carrying a ZED2 camera, an Ouster 3D LiDAR and the Ouster IMU was walked
through elevator cabins. A LiDAR pointed at a mirror reports returns from
behind it, so the cabin appears to extend into space that is solid wall. Eight
traversals cover seven physical cabins, and each cabin was measured by hand so
the real boundary can be compared against what the sensors report.

`elevator_02` and `elevator_03` are two runs of one cabin; the `footprint`
field groups them.

**Details**

-   Dataset name: ``mirror-elevator``
-   Dataset source: https://huggingface.co/datasets/Voxel51/MirrorSentinel-Elevator
-   Dataset size: 6.18 GB
-   Dataset license: CC-BY-4.0
-   Tags: ``multimodal, mcap, slam, lidar, imu``
-   Supported splits: ``N/A``
-   ZooDataset class:
    :class:`MirrorSentinelElevatorDataset <fiftyone.zoo.datasets.base.MirrorSentinelElevatorDataset>`

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("mirror-elevator")

        # One run per physical cabin
        view = dataset.match({"sequence": {"$ne": "elevator_03"}})

        session = fo.launch_app(dataset)

  .. group-tab:: CLI

    .. code-block:: shell

        fiftyone zoo datasets load mirror-elevator

        fiftyone app launch mirror-elevator

.. image:: /images/dataset_zoo/mirror-elevator.png
   :alt: mirror-elevator
   :align: center
