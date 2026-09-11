.. _dataset-zoo-cmht-autonomous-driving:

CMHT Autonomous Driving
-----------------------

.. default-role:: code

Autonomous driving episodes with camera, infrared, lidar, radar, and GPS
streams recorded via ROS2 and stored as native `.mcap` files, with
expert-generated object detection annotations.

The episodes cover diverse driving conditions, including nighttime and rain.

**Details**

-   Dataset name: ``cmht-autonomous-driving``
-   Dataset source: https://huggingface.co/datasets/Voxel51/cmht-autonomous-driving
-   Dataset size: 61.8 GB
-   Dataset license: CC0-1.0
-   Tags: ``multimodal, mcap, autonomous-driving, lidar, radar``
-   Supported splits: ``N/A``
-   ZooDataset class:
    :class:`CMHTAutonomousDrivingDataset <fiftyone.zoo.datasets.base.CMHTAutonomousDrivingDataset>`

**Example usage**

.. tabs::

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("cmht-autonomous-driving")

        session = fo.launch_app(dataset)

  .. group-tab:: CLI

    .. code-block:: shell

        fiftyone zoo datasets load cmht-autonomous-driving

        fiftyone app launch cmht-autonomous-driving

.. image:: /images/dataset_zoo/cmht-autonomous-driving.png
   :alt: cmht-autonomous-driving
   :align: center
